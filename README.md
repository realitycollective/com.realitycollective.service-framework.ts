# Reality Collective Service Framework for TypeScript

A TypeScript-first implementation of the Reality Collective Service Framework, built as a centralized core runtime with thin host integrations for React and three.js.

Current release: **v1.0.0-preview.1**

## Packages

| Package | Description |
| --- | --- |
| `@realitycollective/service-framework` | Core runtime — DI, lifecycle, events, schedulers, configuration |
| `@realitycollective/service-framework-react` | React provider and hooks |
| `@realitycollective/service-framework-three` | three.js render-loop bridge |
| `@realitycollective/service-framework-client` | Opinionated client composition for React + three.js apps |

## Installation

This release is published under the `preview` dist-tag. Use `@preview` to install:

```sh
# Core only
npm install @realitycollective/service-framework@preview

# Core + React bindings
npm install @realitycollective/service-framework@preview @realitycollective/service-framework-react@preview

# Core + three.js bindings
npm install @realitycollective/service-framework@preview @realitycollective/service-framework-three@preview

# Full client (React + three.js composition layer)
npm install @realitycollective/service-framework-client@preview
```

## Documentation

| Document | Description |
| --- | --- |
| [Web-Implementation-and-Usage.md](documentation/Web-Implementation-and-Usage.md) | Architecture, service authoring, consumption patterns, and advanced use cases |
| [Weather-Client-Walkthrough.md](documentation/Weather-Client-Walkthrough.md) | Step-by-step guide: build a deployable React weather app from scratch |
| [Migration-Unity-to-Web.md](documentation/Migration-Unity-to-Web.md) | Concept mapping for developers moving from the Unity framework |
| [Design.md](documentation/Design.md) | Architecture and design decisions |

## Examples

Each package ships a focused example in its own `Examples/` folder:

| Package | Example |
| --- | --- |
| `packages/service-framework/Examples/` | Plain web — `TimerScheduler`, no host bindings |
| `packages/service-framework-react/Examples/` | React — `ServiceFrameworkProvider` and `useService` |
| `packages/service-framework-three/Examples/` | three.js — `ThreeRenderLoopBridge` render loop |
| `packages/service-framework-client/Examples/` | React + three.js — full client composition |

## Runnable apps

See `runtime-examples/` for standalone Vite apps:

- `client-runtime-app-example` — higher-level client runtime reference
- `weather-client-example` — teaching-focused walkthrough (matches the documentation guide)
