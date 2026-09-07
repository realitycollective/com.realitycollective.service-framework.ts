/**
 * A telemetry gateway for a small fleet of sensors.
 *
 * Nothing here imports an engine, a renderer or any other package. These are
 * ordinary services: they hold state, they run on the scheduler, and one of
 * them fails to start when its configuration is missing.
 */
import { BaseService, createServiceToken, type LifecycleContext } from "@realitycollective/service-framework";

export interface GatewayConfig {
  /** How many sensors the gateway is polling. */
  readonly deviceCount: number;
  /** Chance per poll that a connected device drops. 0 is a perfect network. */
  readonly dropChance: number;
  /** Polls between a drop and the first reconnect attempt. */
  readonly reconnectDelay: number;
  /** Whether the calibration profile this deployment needs is present. */
  readonly calibrationProfile: string | null;
}

/** Deterministic PRNG, so a run is reproducible and a demo is not luck. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export interface DeviceState {
  readonly id: string;
  connected: boolean;
  /** Rolling window of the most recent polls: a reading, or a gap. */
  readonly window: ("reading" | "gap")[];
  seq: number;
  received: number;
  missed: number;
  reconnects: number;
}

export const WINDOW_SIZE = 140;
const POLL_EVERY_FRAMES = 5;

/**
 * Polls the sensors and reports connection changes.
 *
 * The gateway cannot tell an operator why a device went quiet - only that it
 * did. The records it emits are the difference between "sensor 3 has gaps"
 * and "sensor 3 dropped at poll 412 and took four attempts to come back".
 */
export class DeviceGatewayService extends BaseService<GatewayConfig> {
  public readonly devices: DeviceState[] = [];
  private readonly random = makeRandom(0x5eed);
  private readonly retryAt = new Map<string, number>();
  private poll = 0;
  private frames = 0;

  public override initialize(): void {
    for (let index = 0; index < this.serviceConfig.deviceCount; index += 1) {
      this.devices.push({
        id: `sensor-${index + 1}`,
        connected: true,
        window: [],
        seq: 0,
        received: 0,
        missed: 0,
        reconnects: 0
      });
    }
  }

  /**
   * Readings are produced on the scheduler, so when the host stops ticking the
   * gateway stops polling. That is a real cause of a data gap and it looks
   * identical to a network drop unless something records the difference.
   */
  public override update(_context: LifecycleContext): void {
    this.frames += 1;
    if (this.frames % POLL_EVERY_FRAMES !== 0) { return; }
    this.poll += 1;

    for (const device of this.devices) {
      if (device.connected) {
        if (this.random() < this.serviceConfig.dropChance) {
          device.connected = false;
          this.retryAt.set(device.id, this.poll + this.serviceConfig.reconnectDelay);
          this.push(device, "gap");
          this.logEvent("device_disconnected", { device: device.id, poll: this.poll, reason: "transport closed" }, "warn");
          continue;
        }

        device.seq += 1;
        device.received += 1;
        this.push(device, "reading");
        continue;
      }

      this.push(device, "gap");
      device.missed += 1;

      const due = this.retryAt.get(device.id) ?? 0;
      if (this.poll < due) { continue; }

      device.reconnects += 1;
      this.logEvent("reconnect_attempt", { device: device.id, attempt: device.reconnects, poll: this.poll }, "debug");

      // A flaky network does not come back on the first try.
      if (this.random() < 0.45) {
        device.connected = true;
        device.reconnects = 0;
        this.logEvent("device_connected", { device: device.id, poll: this.poll, missedPolls: device.missed });
        device.missed = 0;
      } else {
        this.retryAt.set(device.id, this.poll + this.serviceConfig.reconnectDelay);
      }
    }
  }

  public forceDrop(): void {
    const device = this.devices.find((candidate) => candidate.connected);
    if (!device) { return; }
    device.connected = false;
    this.retryAt.set(device.id, this.poll + this.serviceConfig.reconnectDelay);
    this.logEvent("device_disconnected", { device: device.id, poll: this.poll, reason: "forced by operator" }, "warn");
  }

  public get pollCount(): number {
    return this.poll;
  }

  private push(device: DeviceState, sample: "reading" | "gap"): void {
    device.window.push(sample);
    if (device.window.length > WINDOW_SIZE) { device.window.shift(); }
  }
}

/**
 * Fails to initialise when the deployment is missing its calibration profile.
 *
 * A configuration fault, not a code fault, and the kind that only shows up on
 * one deployment. The service throws, the manager reports it and rethrows.
 */
export class CalibrationService extends BaseService<GatewayConfig> {
  public override initialize(): void {
    if (!this.serviceConfig.calibrationProfile) {
      throw new Error("no calibration profile configured for this deployment");
    }
  }
}

/** Summarises what arrived, so the operator has a number to complain about. */
export class IngestService extends BaseService<GatewayConfig> {
  private lastReported = 0;

  public constructor(
    context: ConstructorParameters<typeof BaseService<GatewayConfig>>[0],
    private readonly gateway: DeviceGatewayService
  ) {
    super(context);
  }

  /**
   * Reports a summary every 200 polls, never per frame. Telemetry is per
   * event; a per-frame record would be a per-frame allocation.
   */
  public override lateUpdate(): void {
    const poll = this.gateway.pollCount;
    if (poll === 0 || poll - this.lastReported < 200) { return; }
    this.lastReported = poll;

    const offline = this.gateway.devices.filter((device) => !device.connected).map((device) => device.id);
    this.logEvent("ingest_summary", {
      poll,
      devices: this.gateway.devices.length,
      offline: offline.length,
      offlineIds: offline
    });
  }

  public get completeness(): number {
    const devices = this.gateway.devices;
    if (devices.length === 0) { return 0; }
    const total = devices.reduce((sum, device) => sum + device.window.length, 0);
    const readings = devices.reduce(
      (sum, device) => sum + device.window.filter((sample) => sample === "reading").length,
      0
    );
    return total === 0 ? 0 : readings / total;
  }
}

export const GATEWAY = createServiceToken<DeviceGatewayService>("DeviceGatewayService");
export const CALIBRATION = createServiceToken<CalibrationService>("CalibrationService");
export const INGEST = createServiceToken<IngestService>("IngestService");
