/**
 * A telemetry collector.
 *
 * This lives in the application, not the framework. The framework hands out one
 * function - `TelemetryLog` - and stops there. Everything below is the decision
 * an application makes about what to do with the records: how many to hold, how
 * often to write them out, and where they go.
 *
 * It is deliberately small. A production collector adds persistence and network
 * transport; the shape does not change.
 */
import type { LifecycleContext, ServiceManager, TelemetryLevel } from "@realitycollective/service-framework";

/** One record, with the envelope that makes a stream reconstructable. */
export interface TelemetryRecord {
  readonly id: string;
  readonly sessionId: string;
  /** Monotonic per session. A gap in this sequence is proof of lost records. */
  readonly seq: number;
  readonly timestampMs: number;
  /** Frame time of the last tick, so a record can be placed within the frame. */
  readonly frameTimeMs: number;
  readonly frame: number;
  readonly source: string;
  readonly name: string;
  readonly level: TelemetryLevel;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export interface TelemetrySink {
  readonly name: string;
  write(records: readonly TelemetryRecord[]): void;
}

export interface TelemetryConfig {
  /** Flush when this many milliseconds of frame time have passed. */
  readonly flushIntervalMs?: number;
  /** Flush immediately once the queue holds this many records. */
  readonly maxBatch?: number;
  /** Ring capacity. Oldest records are dropped and counted, never unbounded. */
  readonly maxQueue?: number;
  readonly sinks?: readonly TelemetrySink[];
}

export class TelemetryCollector {
  private readonly queue: (TelemetryRecord | undefined)[];
  private readonly maxQueue: number;
  private readonly maxBatch: number;
  private readonly flushIntervalMs: number;
  private readonly sessionId: string;
  private readonly sinks: TelemetrySink[];

  private head = 0;
  private tail = 0;
  private size = 0;
  private seq = 0;
  private lastFlushAt = 0;

  private frame = 0;
  private frameTimeMs = 0;
  private source = "startup";

  public dropped = 0;
  public flushes = 0;

  public constructor(config: TelemetryConfig = {}) {
    this.maxQueue = config.maxQueue ?? 5000;
    this.maxBatch = config.maxBatch ?? 50;
    this.flushIntervalMs = config.flushIntervalMs ?? 2000;
    this.sessionId = `s${Date.now().toString(36)}`;
    this.sinks = [...(config.sinks ?? [])];
    this.queue = new Array<TelemetryRecord | undefined>(this.maxQueue);
    this.log = this.log.bind(this);
  }

  /**
   * The emitter. Hand this to `new ServiceManager({ log })` and every service
   * reaches the same instance through `logEvent`, so framework records and
   * application records land in one ordered stream.
   */
  public log(name: string, payload?: Record<string, unknown>, level: TelemetryLevel = "info"): void {
    this.seq += 1;

    const record: TelemetryRecord = {
      id: `${this.sessionId}-${this.seq}`,
      sessionId: this.sessionId,
      seq: this.seq,
      timestampMs: Date.now(),
      frameTimeMs: this.frameTimeMs,
      frame: this.frame,
      source: this.source,
      name,
      level,
      ...(payload ? { payload } : {})
    };

    if (this.size === this.maxQueue) {
      this.head = (this.head + 1) % this.maxQueue;
      this.size -= 1;
      this.dropped += 1;
    }

    this.queue[this.tail] = record;
    this.tail = (this.tail + 1) % this.maxQueue;
    this.size += 1;

    if (this.size >= this.maxBatch) {
      this.flush();
    }
  }

  /**
   * Drive flushing from the scheduler rather than `setInterval`. The host ticks
   * only while it is running, so this stops when the application stops instead
   * of firing into a paused runtime, and it stays deterministic under a mock
   * scheduler.
   *
   * `lateTick` rather than `tick`, so records emitted during the frame are in
   * that frame's own batch.
   */
  public bind(manager: ServiceManager): () => void {
    const unsubscribes = [
      manager.scheduler.subscribe("tick", (context: LifecycleContext) => {
        this.frame = context.frame;
        this.frameTimeMs = context.timestamp;
        this.source = context.source;
      }),
      manager.scheduler.subscribe("lateTick", (context: LifecycleContext) => {
        if (context.timestamp - this.lastFlushAt >= this.flushIntervalMs) {
          this.lastFlushAt = context.timestamp;
          this.flush();
        }
      }),
      manager.scheduler.subscribe("focusChange", (context) => {
        if (!context.focused) { this.flush(); }
      }),
      manager.scheduler.subscribe("pauseChange", (context) => {
        if (context.paused) { this.flush(); }
      }),
      manager.scheduler.subscribe("dispose", () => { this.flush(); })
    ];

    return () => { for (const unsubscribe of unsubscribes) { unsubscribe(); } };
  }

  public flush(): void {
    if (this.size === 0) { return; }

    const batch: TelemetryRecord[] = [];
    while (this.size > 0) {
      const record = this.queue[this.head];
      if (record) { batch.push(record); }
      this.queue[this.head] = undefined;
      this.head = (this.head + 1) % this.maxQueue;
      this.size -= 1;
    }

    this.flushes += 1;

    for (const sink of this.sinks) {
      // A sink that throws must never become a failure of the thing it is
      // reporting on.
      try {
        sink.write(batch);
      } catch {
        /* counted by the sink itself in a real collector; ignored here */
      }
    }
  }

  public get queued(): number {
    return this.seq;
  }
}
