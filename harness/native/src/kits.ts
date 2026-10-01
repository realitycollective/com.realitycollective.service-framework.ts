/**
 * The Service Framework's shared suites, run against a native host's test
 * host on the device, or against this repository's reference fake under Node.
 * One JSON line per suite and one `done` line at the end, the shape the
 * conversion pipeline's runner reads.
 *
 * On a device the shell installs `__rcShell.testHost`: a second host object
 * (never the live `__rcHost`, whose frames the suites must not disturb). It
 * is the `NativeHost` members plus four drivers: `hostStart()` (a session
 * begins and takes focus), `hostEnd()` (the session ends), `injectFrame()`
 * (one frame reaches the frame callbacks) and `serveBytes()` (a file the
 * `io` slice will return). Under Node the reference fake stands in, so the
 * same bundle proves the bundle.
 */
import {
  BaseService,
  ManualScheduler,
  ServiceManager,
  createServiceProfile,
  createServiceToken,
  hostIOContractCases,
  renderTickContractCases,
  runtimeAdapterContractCases,
  type HostIOSubject,
  type RenderTickSubject,
  type RuntimeAdapterSubject,
  type ServiceActivationContext,
} from "@realitycollective/service-framework";
import { NativeRuntimeAdapter, createNativeHostIO, type NativeHost } from "@realitycollective/service-framework-native";
import { emit, settle, shellGlobal } from "./prelude.js";

/** A native host a suite can drive: the `NativeHost` members plus the shell's four drivers. */
export interface DrivableHost extends NativeHost {
  /** A session begins and takes focus (state `focused`). Does nothing while one is focused. */
  hostStart(): void;
  /** The session ends (state `none`). */
  hostEnd(): void;
  /** One frame reaches every `onFrame` callback: display time in milliseconds, delta in seconds. */
  injectFrame(timestampMs: number, deltaSeconds: number): void;
  /** A file the `io` slice returns for `url`. Optional: a shell without an `io` slice omits it. */
  serveBytes?(url: string, bytes: Uint8Array): void;
}

export interface SuiteResult {
  name: string;
  pass: number;
  fail: number;
  total: number;
  failures: Array<{ name: string; error: string }>;
}

/** The shell's test host, if the shell installed one. */
export function shellTestHost(): DrivableHost | null {
  const test = shellGlobal().testHost;
  if (typeof test !== "object" || test === null) return null;
  const t = test as Partial<DrivableHost>;
  if (typeof t.getSessionInfo !== "function" || typeof t.onFrame !== "function" || typeof t.hostStart !== "function") return null;
  return t as DrivableHost;
}

async function runCases<S>(
  name: string,
  cases: readonly { name: string; run(subject: S): void | Promise<void> }[],
  subject: () => S,
): Promise<SuiteResult> {
  const result: SuiteResult = { name, pass: 0, fail: 0, total: 0, failures: [] };
  for (const c of cases) {
    result.total += 1;
    try {
      const out = c.run(subject());
      if (out && typeof (out as Promise<void>).then === "function") await settle(out as Promise<void>);
      result.pass += 1;
    } catch (error) {
      result.fail += 1;
      result.failures.push({ name: c.name, error: String((error as Error)?.message ?? error) });
    }
  }
  emit("suite", { name, pass: result.pass, fail: result.fail, total: result.total, failures: result.failures });
  return result;
}

/** A host with no session: every case starts from `none`. */
function freshRoot(host: DrivableHost): DrivableHost {
  if (host.getSessionInfo().state !== "none") host.hostEnd();
  return host;
}

/** The runtime adapter suite over `NativeRuntimeAdapter`, driven through the host's drivers. */
function adapterSubject(host: DrivableHost): RuntimeAdapterSubject {
  freshRoot(host);
  // The driver's sessionStart means "the host hands over the next session". Once the adapter has ended a session itself
  // (a mode switch ends the live session, then requests the new mode), the hand-over waits for the adapter's next
  // requestSession, as an app answers a request; otherwise the host starts one at once.
  let adapterEnded = false;
  let pendingStart = false;
  const driven = Object.create(host) as DrivableHost;
  driven.endSession = () => {
    adapterEnded = true;
    host.endSession();
  };
  driven.requestSession = (mode, options) => {
    adapterEnded = false;
    host.requestSession(mode, options);
    if (pendingStart) {
      pendingStart = false;
      host.hostStart();
    }
  };
  const adapter = new NativeRuntimeAdapter({ host: driven });
  // A native platform delivers frames only to a live, focused session (the adapter passes nothing else on), so a frame
  // the driver delivers is a frame of a focused session.
  const focus = (): void => {
    if (host.getSessionInfo().state !== "focused") host.hostStart();
  };
  const sessionStart = (): void => {
    if (adapterEnded || host.getSessionInfo().state === "focused") pendingStart = true;
    else host.hostStart();
  };
  return {
    adapter,
    drive: {
      frame: (timestamp, delta) => {
        focus();
        host.injectFrame(timestamp, delta);
      },
      capabilities: (partial) => adapter.setCapabilities(partial),
      sessionStart,
      sessionEnd: () => host.hostEnd(),
    },
  };
}

/** The renderTick suite: a focused session, frames in the native unit (milliseconds, delta in seconds). */
function renderTickSubject(host: DrivableHost): RenderTickSubject {
  freshRoot(host);
  const scheduler = new ManualScheduler();
  new NativeRuntimeAdapter({ host, scheduler });
  host.hostStart();
  let last: number | null = null;
  return {
    scheduler,
    drive: {
      frame: (ms) => {
        const deltaS = last === null ? 0 : (ms - last) / 1000;
        last = ms;
        host.injectFrame(ms, deltaS);
      },
    },
  };
}

/** The host I/O suite over `createNativeHostIO`, serving bytes through the host's `serveBytes`. */
function ioSubject(host: DrivableHost): HostIOSubject {
  return {
    io: createNativeHostIO(host),
    drive: {
      serve: (url, bytes) => {
        if (!host.serveBytes) throw new Error("the test host has no serveBytes");
        host.serveBytes(url, bytes);
      },
    },
  };
}

/**
 * A profile boots and disposes with no global `AbortController`, and each
 * service's signal aborts once. Hermes has none; under Node the global is
 * removed for the check and put back.
 */
function bootWithoutAbortController(): SuiteResult {
  const name = "boots with no global AbortController";
  const g = globalThis as { AbortController?: unknown };
  const saved = g.AbortController;
  const hadGlobal = typeof saved !== "undefined";
  const aborts: Record<string, number> = { alpha: 0, beta: 0 };
  const signals: Record<string, { aborted: boolean }> = {};
  class Probe extends BaseService {
    constructor(context: ServiceActivationContext, key: string) {
      super(context);
      signals[key] = context.signal;
      context.signal.addEventListener("abort", () => {
        aborts[key] = (aborts[key] ?? 0) + 1;
      });
    }
  }
  const ALPHA = createServiceToken<Probe>("harness.boot.alpha");
  const BETA = createServiceToken<Probe>("harness.boot.beta");
  const result: SuiteResult = { name, pass: 0, fail: 0, total: 1, failures: [] };
  try {
    delete g.AbortController;
    const manager = new ServiceManager({ scheduler: new ManualScheduler() });
    manager.initializeProfile(
      createServiceProfile("harness-boot", [
        { token: ALPHA, useFactory: (c) => new Probe(c as ServiceActivationContext, "alpha") },
        { token: BETA, useFactory: (c) => new Probe(c as ServiceActivationContext, "beta") },
      ]),
    );
    manager.start();
    manager.dispose();
    const once = aborts.alpha === 1 && aborts.beta === 1 && signals.alpha?.aborted === true && signals.beta?.aborted === true;
    if (!once) throw new Error(`each service signal must abort exactly once, got ${JSON.stringify(aborts)}`);
    result.pass = 1;
  } catch (error) {
    result.fail = 1;
    result.failures.push({ name, error: String((error as Error)?.stack ?? error) });
  } finally {
    if (hadGlobal) g.AbortController = saved;
  }
  emit("suite", { name, pass: result.pass, fail: result.fail, total: result.total, failures: result.failures, globalWasPresent: hadGlobal });
  return result;
}

/** Run every suite this family ships against the host given. */
export async function runServiceFrameworkKits(host: DrivableHost): Promise<{ suites: SuiteResult[]; pass: boolean }> {
  const suites: SuiteResult[] = [];
  suites.push(await runCases("runtime adapter (NativeRuntimeAdapter)", runtimeAdapterContractCases(), () => adapterSubject(host)));
  suites.push(await runCases("render tick (NativeRuntimeAdapter + ManualScheduler)", renderTickContractCases(), () => renderTickSubject(host)));
  if (host.io && host.serveBytes) {
    suites.push(await runCases("host io (createNativeHostIO)", hostIOContractCases(), () => ioSubject(host)));
  } else {
    const total = hostIOContractCases().length;
    const failures = [{ name: "*", error: host.io ? "the test host has no serveBytes" : "the test host has no io slice" }];
    emit("suite", { name: "host io (createNativeHostIO)", pass: 0, fail: total, total, failures });
    suites.push({ name: "host io (createNativeHostIO)", pass: 0, fail: total, total, failures });
  }
  suites.push(bootWithoutAbortController());
  freshRoot(host);
  const pass = suites.every((s) => s.fail === 0);
  emit("kits", { pass, suites: suites.map((s) => ({ name: s.name, pass: s.pass, fail: s.fail, total: s.total })) });
  return { suites, pass };
}
