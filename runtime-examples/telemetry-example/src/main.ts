/**
 * "Sensor 3 has gaps in its data."
 *
 * A support ticket about missing readings. Three completely different causes
 * produce the identical symptom on the operator's screen:
 *
 *   1. the network dropped, and reconnecting took several attempts
 *   2. the host stopped ticking, so the gateway stopped polling
 *   3. a service failed to start, so nothing ever ran at all
 *
 * Only the record stream tells them apart. Turn telemetry off and press every
 * button: the gaps look the same and you have nothing to go on.
 */
import { ManualScheduler, ServiceManager, createEnvironmentDescriptor, type LifecycleContext } from "@realitycollective/service-framework";
import { createProfile } from "./profile.js";
import { GATEWAY, INGEST, WINDOW_SIZE, type DeviceState, type GatewayConfig } from "./services/services.js";
import { TelemetryCollector } from "./telemetry/collector.js";
import { ConsoleSink, MemorySink } from "./telemetry/sinks.js";
import "./styles.css";

// --- state ------------------------------------------------------------------

let manager: ServiceManager | null = null;
let scheduler: ManualScheduler | null = null;
let collector: TelemetryCollector | null = null;
let sink: MemorySink | null = null;
let unbind: (() => void) | null = null;
let frameHandle = 0;
let frame = 0;
let booted = false;
let backgrounded = false;

const settings: GatewayConfig & { telemetry: boolean } = {
  deviceCount: 4,
  dropChance: 0.012,
  reconnectDelay: 6,
  calibrationProfile: "factory-default",
  telemetry: true
};

// --- dom --------------------------------------------------------------------

const $ = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) { throw new Error(`missing element #${id}`); }
  return element as T;
};

const streamBody = $("stream-body");
const streamEmpty = $("stream-empty");
const deviceList = $("device-list");
const opsLog = $("ops-log");
const statusLine = $("status-line");
const recordCount = $("record-count");
const completeness = $("completeness");

const canvases = new Map<string, HTMLCanvasElement>();

function say(message: string, tone: "plain" | "bad" = "plain"): void {
  const line = document.createElement("div");
  line.className = `ops-line${tone === "bad" ? " ops-line-bad" : ""}`;
  line.textContent = message;
  opsLog.appendChild(line);
  opsLog.scrollTop = opsLog.scrollHeight;
}

function buildDeviceRows(devices: readonly DeviceState[]): void {
  deviceList.innerHTML = "";
  canvases.clear();

  for (const device of devices) {
    const row = document.createElement("div");
    row.className = "device-row";

    const label = document.createElement("span");
    label.className = "device-name";
    label.textContent = device.id;

    const canvas = document.createElement("canvas");
    canvas.width = WINDOW_SIZE * 2;
    canvas.height = 24;
    canvas.className = "device-strip";

    row.append(label, canvas);
    deviceList.appendChild(row);
    canvases.set(device.id, canvas);
  }
}

function drawDevices(devices: readonly DeviceState[]): void {
  const style = getComputedStyle(document.body);
  const ok = style.getPropertyValue("--accent").trim() || "#2f6f4f";
  const gap = style.getPropertyValue("--bad").trim() || "#a4342c";
  const idle = style.getPropertyValue("--line").trim() || "#e4e4e0";

  for (const device of devices) {
    const canvas = canvases.get(device.id);
    const context = canvas?.getContext("2d");
    if (!canvas || !context) { continue; }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = idle;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const offset = WINDOW_SIZE - device.window.length;
    for (let index = 0; index < device.window.length; index += 1) {
      context.fillStyle = device.window[index] === "reading" ? ok : gap;
      context.fillRect((offset + index) * 2, 0, 2, canvas.height);
    }
  }
}

function renderRecords(): void {
  if (!sink) { return; }
  streamEmpty.hidden = sink.records.length > 0;

  // Only the tail is worth rendering; the export carries everything.
  const tail = sink.records.slice(-200);
  streamBody.innerHTML = tail
    .map((record) => {
      const payload = record.payload ? JSON.stringify(record.payload) : "";
      return `<tr class="lvl-${record.level}">
        <td class="seq">${record.seq}</td>
        <td class="lvl">${record.level}</td>
        <td class="name">${record.name}</td>
        <td class="payload">${escapeHtml(payload)}</td>
      </tr>`;
    })
    .join("");

  recordCount.textContent = `${sink.records.length} record${sink.records.length === 1 ? "" : "s"}`;
  const scroller = streamBody.closest(".stream");
  if (scroller) { scroller.scrollTop = scroller.scrollHeight; }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] ?? character);
}

// --- lifecycle --------------------------------------------------------------

function boot(): void {
  shutdown();
  opsLog.innerHTML = "";
  deviceList.innerHTML = "";
  frame = 0;
  backgrounded = false;

  sink = new MemorySink(() => renderRecords());
  // A short flush interval so the demo feels live. Batching is still real:
  // records queue during the frame and are written together on lateTick.
  collector = new TelemetryCollector({ flushIntervalMs: 400, maxBatch: 25, sinks: [sink, new ConsoleSink()] });

  scheduler = new ManualScheduler();
  const environment = createEnvironmentDescriptor("browser", ["dom", "focus", "visibility", "timers"]);

  // The only line that differs between a gateway you can support and one you cannot.
  manager = settings.telemetry
    ? new ServiceManager({ scheduler, environment, log: collector.log })
    : new ServiceManager({ scheduler, environment });

  if (settings.telemetry) {
    unbind = collector.bind(manager);
  }

  try {
    manager.initializeProfile(createProfile(settings));
    scheduler.emit("startup", undefined);
    booted = true;
    buildDeviceRows(manager.resolve(GATEWAY).devices);
    say("Gateway online. Polling 4 sensors.");
    statusLine.textContent = "polling";
  } catch (error) {
    // The framework reported this before rethrowing. Without telemetry the
    // message below is the only trace, and it never leaves the deployment.
    booted = false;
    const message = error instanceof Error ? error.message : String(error);
    say("Gateway failed to come up. No readings will arrive.", "bad");
    say(`(the cause, which the operator never sees: ${message})`, "bad");
    statusLine.textContent = "down - services never started";
  }

  startFrameLoop();
  renderRecords();
}

function startFrameLoop(): void {
  cancelAnimationFrame(frameHandle);
  const step = (now: number): void => {
    // A backgrounded host stops ticking. The gateway stops polling with it,
    // and the resulting gap is indistinguishable from a network drop on screen.
    if (scheduler && !backgrounded) {
      const context: LifecycleContext = { timestamp: now, deltaTime: 16.7, frame, source: "example" };
      scheduler.emit("tick", context);
      scheduler.emit("lateTick", context);
      frame += 1;

      if (manager && booted && frame % 6 === 0) {
        const gateway = manager.resolve(GATEWAY);
        drawDevices(gateway.devices);
        completeness.textContent = `${Math.round(manager.resolve(INGEST).completeness * 100)}% complete`;
      }
    }
    frameHandle = requestAnimationFrame(step);
  };
  frameHandle = requestAnimationFrame(step);
}

function shutdown(): void {
  cancelAnimationFrame(frameHandle);
  unbind?.();
  unbind = null;
  manager?.dispose();
  manager = null;
  scheduler = null;
  booted = false;
}

// --- wiring -----------------------------------------------------------------

$("boot").addEventListener("click", boot);

$("force-drop").addEventListener("click", () => {
  if (!manager || !booted) { say("Nothing to drop - the gateway is not running.", "bad"); return; }
  manager.resolve(GATEWAY).forceDrop();
  say("A sensor went quiet.", "bad");
});

$("background").addEventListener("click", () => {
  if (!manager || backgrounded) { return; }
  backgrounded = true;
  manager.emitFocusChange(false);
  manager.emitPauseChange({ paused: true });
  say("Tab backgrounded. Polling has stopped.");
  statusLine.textContent = "paused - host is not ticking";
});

$("foreground").addEventListener("click", () => {
  if (!manager || !backgrounded) { return; }
  backgrounded = false;
  manager.emitFocusChange(true);
  manager.emitPauseChange({ paused: false });
  say("Tab foregrounded. Polling resumed.");
  statusLine.textContent = "polling";
});

$("shutdown").addEventListener("click", () => {
  shutdown();
  say("Gateway shut down.");
  statusLine.textContent = "stopped";
});

$("toggle-telemetry").addEventListener("change", (event) => {
  settings.telemetry = (event.target as HTMLInputElement).checked;
  boot();
});
$("toggle-network").addEventListener("change", (event) => {
  (settings as { dropChance: number }).dropChance = (event.target as HTMLInputElement).checked ? 0.012 : 0;
  boot();
});
$("toggle-calibration").addEventListener("change", (event) => {
  (settings as { calibrationProfile: string | null }).calibrationProfile =
    (event.target as HTMLInputElement).checked ? "factory-default" : null;
  boot();
});

$("export").addEventListener("click", () => {
  if (!sink || sink.records.length === 0) { return; }
  const blob = new Blob([sink.toNdjson()], { type: "application/x-ndjson" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "gateway-session.ndjson";
  anchor.click();
  URL.revokeObjectURL(url);
});

$("copy").addEventListener("click", async () => {
  if (!sink) { return; }
  await navigator.clipboard.writeText(sink.toNdjson());
  const button = $("copy");
  const original = button.textContent;
  button.textContent = "Copied";
  setTimeout(() => { button.textContent = original; }, 1200);
});

boot();
