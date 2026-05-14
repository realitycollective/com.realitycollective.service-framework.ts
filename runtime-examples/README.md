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

### `weather-client-example`

Teaching-focused weather example that shows:

- a service token
- a `BaseService` implementation
- profile registration
- React consumption through `ServiceFrameworkProvider` and `useService`

See `runtime-examples/weather-client-example/README.md`
