/**
 * The telemetry emission seam.
 *
 * The framework reports what happens inside itself - services activating,
 * failing, focus and pause changes, teardown - through a single function it is
 * handed at construction. It does not queue, batch, format or send anything.
 * Where those records go is the application's decision, and the collector that
 * makes it lives outside this package.
 *
 * The same function reaches every service as `logEvent`, so an application's
 * own records share one stream, one ordering and one export with the
 * framework's.
 *
 * With nothing configured every call lands on {@link NO_OP_TELEMETRY_LOG}.
 */

/** Severity of a record. Sinks route on this rather than parsing the name. */
export type TelemetryLevel = "debug" | "info" | "warn" | "error";

/**
 * A telemetry emitter. Supply one to `ServiceManager` to receive the
 * framework's own records; every service then reaches the same emitter through
 * `logEvent`.
 *
 * Implementations must not throw: a record is a side channel, and a failure to
 * report must never become a failure of the thing being reported on.
 */
export type TelemetryLog = (
  name: string,
  payload?: Record<string, unknown>,
  level?: TelemetryLevel
) => void;

/**
 * The emitter used when no telemetry is configured. One shared function for the
 * whole application, so an unconfigured manager allocates nothing per call and
 * a consumer can identity-compare against it to detect the default.
 */
export const NO_OP_TELEMETRY_LOG: TelemetryLog = () => {};
