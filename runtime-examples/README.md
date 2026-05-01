# Runtime Examples

Runnable application examples for the Reality Collective TypeScript Service Framework.

These differ from the package-level examples under `packages/service-framework/Examples/`:

- `packages/service-framework/Examples/` focuses on smaller host integration samples
- `runtime-examples/` contains standalone apps with their own Vite setup, dependencies, build scripts, and local HTTPS serving

## Available apps

### `client-runtime-app-example`

Higher-level runtime client example built on:

- `@realitycollective/service-framework`
- `@realitycollective/service-framework-react`
- `@realitycollective/service-framework-three`
- `@realitycollective/service-framework-client`

See:

- `runtime-examples/client-runtime-app-example/README.md`

### `weather-client-example`

Teaching-focused weather example that shows:

- a service token
- a `BaseService` implementation
- profile registration
- React consumption through `ServiceFrameworkProvider` and `useService`

See:

- `runtime-examples/weather-client-example/README.md`
