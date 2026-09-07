# Telemetry example - "Sensor 3 has gaps in its data"

An example built to demonstrate the optional logging / telemetry features included with the Service Framework.

The sample is a sensor gateway polling four devices over a flaky network. The operator's complaint is a data gap. **Three completely different causes produce that identical symptom:**

1. the network dropped, and reconnecting took several attempts
2. the host stopped ticking, so the gateway stopped polling
3. a service failed to start, so nothing ever ran at all

On screen all three look the same: red instead of green. Only the record stream tells them apart.

**Turn telemetry off and cause every fault.** The gaps still appear, the stream stays empty, and you have nothing to go on.

## Run it

```sh
npm install
npm run dev       # http://localhost:5175
```

`predev` builds the framework packages first, so a clean checkout works. The example depends on `@realitycollective/service-framework` by local path and nothing else.

## What it demonstrates

**The framework reports what only it can see.** When the calibration profile is missing, `CalibrationService` throws during `initialize`. The framework records `service_failed` with the service name, the phase and the message, then rethrows the original error unchanged. Nothing in the application could have produced that record.

**What is missing is as diagnostic as what is present.** That throw stops activation, so there is no `profile_initialized` and no `service_started` at all. The absence is the diagnosis: nothing ever ran.

**Platform lifecycle is a real cause of application symptoms.** Backgrounding the tab stops the host ticking, so the gateway stops polling. The data gap is identical to a network drop. `pause_change` and `focus_change` are the only things that distinguish them, and only the framework knows they happened.

**Application records share the stream.** `device_disconnected`, `reconnect_attempt`, `device_connected` and `ingest_summary` come from ordinary services calling `this.logEvent(...)` - no token lookup, no registration. They carry the same monotonic sequence and envelope as the framework's own records and export alongside them.

**Collection is the application's job.** The collector in `src/telemetry/` is application code. The framework supplied one function; the ring buffer, the envelope, batching, the sinks and NDJSON export are all decisions this app made.

## Try this

| Do | See |
| --- | --- |
| Watch it run | Occasional red gaps. `device_disconnected` at `warn`, then `reconnect_attempt` until one succeeds |
| Press **Drop a sensor** | A gap you caused, recorded with `reason: "forced by operator"` |
| Press **Background tab** | Every strip gaps at once. `pause_change` and `focus_change` explain why, and no further records accrue because nothing is ticking |
| Untick **calibration profile present** | Nothing starts. `service_failed` names the cause; `profile_initialized` and `service_started` never appear |
| Untick **flaky network** | Solid green, and the stream goes quiet apart from the periodic `ingest_summary` |
| Untick **Telemetry** | Cause all of the above again. Nothing is recorded. |
| Press **Copy NDJSON** | The whole session, one JSON object per line, ready to paste into the ticket |

## Layout

```
src/
  main.ts                 UI, wiring, and the frame loop
  profile.ts              service registrations and priorities
  services/services.ts    gateway, ingest, calibration
  telemetry/collector.ts  ring buffer, envelope, batching, scheduler-driven flush
  telemetry/sinks.ts      memory (for the UI) and console
```

The only line that differs between a gateway you can support and one you cannot:

```ts
new ServiceManager({ scheduler, environment, log: collector.log })
```

## Notes

- Plain TypeScript. No renderer, no React, no other Reality Collective package. Telemetry is a core concern and needs no host binding.
- The device stream is a seeded mock, so a run is reproducible and the demo is not luck.
- Polling runs on the scheduler rather than a timer, which is why a paused host stops it.
- Nothing here emits per frame. `ingest_summary` reports every 200 polls. See [Logging and telemetry](../../documentation/Logging-and-Telemetry.md) for why that rule matters.
