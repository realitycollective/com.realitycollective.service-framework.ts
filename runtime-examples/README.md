# Runtime Examples

Runnable application examples for the Reality Collective TypeScript Service Framework.

These differ from the package-level examples shipped inside each package:

- Each package under `packages/` contains an `Examples/` folder with a focused host integration sample
- `runtime-examples/` contains standalone apps with their own Vite setup, dependencies, build scripts, and local HTTPS serving

## Available apps

### `client-runtime-app-example`

Higher-level runtime client example built on:

- `@realitycollective/service-framework`
- `@realitycollective/service-framework-react`
- `@realitycollective/service-framework-three`
- `@realitycollective/service-framework-client`

See `runtime-examples/client-runtime-app-example/README.md`

### `telemetry-example`

Plain TypeScript example showing why the framework reports its own lifecycle. A sensor gateway on a flaky network, where three different causes produce one identical symptom:

- a network drop, with reconnect attempts, reported by an application service
- a paused host that stops the polling loop, reported by the framework as `focus_change` and `pause_change`
- a service that fails to initialise, reported as `service_failed` and still rethrown
- a collector, sinks and NDJSON export - all application code, none of it in the framework
- a telemetry switch, so you can see what the same three failures look like with nothing recording

No renderer and no other Reality Collective package.

See `runtime-examples/telemetry-example/README.md`

### `weather-client-example`

Teaching-focused weather example that shows:

- a service token
- a `BaseService` implementation
- profile registration
- React consumption through `ServiceFrameworkProvider` and `useService`

See `runtime-examples/weather-client-example/README.md`
