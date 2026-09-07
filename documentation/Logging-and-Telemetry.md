# Logging and telemetry

The framework reports what happens inside itself - services activating, failing, focus and pause changes, teardown - through a single function you give it. It does not queue, batch, format or send anything. Where records go is your decision.

That split is the whole design:

- **The framework emits.** Only it can see a service that threw during `initialize`, so only it can report one.
- **Your application collects.** Queueing, batching, transport and storage are application concerns, and they differ per app.

With nothing configured, every emission point reaches one shared no-op function. An application that wants no telemetry pays nothing.

## Turning it on

```ts
import { ServiceManager } from "@realitycollective/service-framework";

const manager = new ServiceManager({
  scheduler,
  environment,
  log: (name, payload, level) => console.log(level, name, payload)
});
```

That is the whole API. `log` is a `TelemetryLog`:

```ts
type TelemetryLog = (
  name: string,
  payload?: Record<string, unknown>,
  level?: TelemetryLevel   // "debug" | "info" | "warn" | "error", default "info"
) => void;
```

## What the framework reports

| Record | When | Level | Payload |
| --- | --- | --- | --- |
| `profile_initialized` | a profile finished activating | info | `name`, `serviceCount` |
| `service_initialized` | a service initialised | debug | `name`, `token`, `priority` |
| `service_started` | a service started | debug | `name` |
| `service_failed` | a service threw in `initialize` or `start` | error | `name`, `phase`, `message` |
| `service_disposed` | a service was destroyed | debug | `name` |
| `focus_change` | `emitFocusChange` was called | info | `focused` |
| `pause_change` | `emitPauseChange` was called | info | `paused` |
| `manager_disposed` | the manager was disposed | info | `serviceCount` |

Two things are worth knowing about `service_failed`:

- The framework reports it and then **rethrows the original error unchanged**. Telemetry observes failures, it does not swallow them.
- Because activation stops at the throw, `profile_initialized` and every later `service_started` are simply absent. **What is missing is as diagnostic as what is present**: no `service_started` means nothing ever ran.

## Logging from your own services

Every service receives the same emitter at construction, so no registration or token lookup is needed:

```ts
class InventoryService extends BaseService<Config> {
  public equip(sku: string): void {
    this.logEvent("item_equipped", { sku });
  }
}
```

Your records and the framework's share one stream, one ordering and one export.

The member is `logEvent`, not `log`, because `log` is the name a service is most likely to have already claimed for its own logging helper, and an inherited member would break it.

## Writing a collector

A collector is any object that supplies a `TelemetryLog`. A useful one adds an envelope, bounds its memory, and writes in batches:

```ts
class Collector {
  private readonly queue: Record[] = [];
  private seq = 0;

  public log = (name: string, payload?: Record<string, unknown>, level: TelemetryLevel = "info"): void => {
    this.seq += 1;
    this.queue.push({ seq: this.seq, timestampMs: Date.now(), name, level, payload });
    if (this.queue.length >= 50) { this.flush(); }
  };

  public bind(manager: ServiceManager): () => void {
    // Flush off the scheduler, never setInterval: the host ticks only while
    // it is running, so this stops with the application instead of firing
    // into a paused runtime, and stays deterministic under a mock scheduler.
    return manager.scheduler.subscribe("lateTick", (context) => {
      if (context.timestamp - this.lastFlushAt >= 5000) { this.flush(); }
    });
  }
}
```

A working version, with a bounded ring, sink isolation and NDJSON export, is in [`runtime-examples/telemetry-example`](../runtime-examples/telemetry-example).

Give each record a monotonic `seq`. A gap in that sequence is proof of loss, which is the only way to know your collector dropped something.

## Rules

**Never emit per frame from the framework, and think hard before doing it from a service.** Nothing in the framework emits from `tick`, `lateTick`, `fixedTick` or `renderTick`, and a test enforces that. A record costs roughly 200ns end to end - immaterial at any sane rate, and about 15% of the per-frame service cost if every service emits every frame.

**A sink must not throw.** A record is a side channel. A failure to report must never become a failure of the thing being reported on. Wrap sink writes and count failures rather than letting them escape.

**Flush from the scheduler, not a timer.** `setInterval` keeps running when the host has stopped ticking; the scheduler does not.

**Prefer `level` over name prefixes.** Routing on a field keeps the name doing one job and lets a sink filter without parsing.

## What this is not

- Not a logger. There is no `info()`/`warn()` API and no formatting.
- Not a transport. No sinks, no batching and no storage ship in the core package.
- Not metrics or tracing. There is no aggregation, sampling or span model.

## See also

- [`runtime-examples/telemetry-example`](../runtime-examples/telemetry-example) - a runnable failure you can only diagnose with telemetry on
- [Web-Implementation-and-Usage.md](Web-Implementation-and-Usage.md) - service authoring and consumption
