# @realitycollective/service-framework

The **core runtime** of the Reality Collective Service Framework for TypeScript - dependency injection, service lifecycle, events, schedulers and configuration, for browser and app runtimes.

```sh
npm install @realitycollective/service-framework
```

A TypeScript-first implementation of the same architecture as the Reality Collective [Unity Service Framework](https://github.com/realitycollective/com.realitycollective.service-framework): services are registered into a profile, resolved by token, and driven by a scheduler that the host environment owns.

## What it provides

| Area | Detail |
| --- | --- |
| **Service manager** | Registration, dependency-ordered start/stop, resolution by token, wait-for-service |
| **Base services** | `BaseService` and `BaseServiceModule` - lifecycle hooks with typed configuration |
| **Tokens** | `createServiceToken<T>()` - type-safe resolution with no string keys at the call site |
| **Scheduler** | Named channels such as `renderTick` that services subscribe to. Your app decides what drives them: a timer, a render loop, or manual ticks |
| **Events** | An in-framework event service for service-to-service messaging |
| **Configuration** | Profile-based configuration with environment awareness |
| **Runtime adapter** | `RuntimeAdapter` - the host seam a service depends on: a per-frame fan-out, XR capability flags, and an optional session facet (`request`, `end`, state and visibility). Host bindings implement it |
| **Session features** | `SessionRequestOptions.requiredFeatures` and `optionalFeatures` - WebXR feature strings for one request, merged over the host's own defaults by `mergeSessionInit(init, options)`. An app that swaps mode mid-session needs them, because the host's defaults were chosen for the mode it is leaving |
| **Capability derivation** | `deriveCapabilities(session)` - reads `immersive`, `handTracking`, `planeDetection`, `passthrough` and `environmentBlendMode` off a live XR session. Shared by every host binding, so the same session reports the same flags under IWSDK and three.js. Its input, `CapabilitySessionLike`, is structural: no WebXR types, no DOM |
| **State-owning services** | `SnapshotService<TConfig, TSnapshot>` - one immutable snapshot plus pub/sub; subscribers get the current value immediately, then every publish |
| **Headless testing** | `MockRuntimeAdapter` - drives frames, capabilities and session lifecycle with no engine, no WebXR and no headset |
| **Adapter conformance** | `runtimeAdapterContractCases()`, `renderTickContractCases()` and `hostIOContractCases()` - the checks every platform binding must pass, shipped as data rather than as test files, so a binding written outside this repository, a native one included, can prove it behaves as the core promises |

`EnvironmentDescriptor` here means the platform environment - the host's name and its capability strings, such as `"dom"` or `"render-loop"` - and is not the same thing as `EnvironmentSpec` in `@realitycollective/webxr-environment`, which describes the visual environment of sky, fog and lighting. An app can hold both at once, so the two names are worth keeping apart.

## Usage

```ts
import {
  ManualScheduler,
  ServiceManager,
  createServiceProfile,
} from "@realitycollective/service-framework";

const scheduler = new ManualScheduler();
const manager = new ServiceManager({ scheduler });

manager.initializeProfile(createServiceProfile("my-app", [/* your service registrations */]));
manager.start();
```

The host decides what drives the scheduler - a timer, a render loop, or an XR frame source.

## Host bindings

The core is host-agnostic. Add exactly one binding for your runtime:

| Package | Host |
| --- | --- |
| [`service-framework-react`](https://www.npmjs.com/package/@realitycollective/service-framework-react) | React provider and hooks |
| [`service-framework-three`](https://www.npmjs.com/package/@realitycollective/service-framework-three) | three.js render loop, plus a WebXR runtime adapter for any page that owns its renderer |
| [`service-framework-babylon`](https://www.npmjs.com/package/@realitycollective/service-framework-babylon) | Babylon.js render loop |
| [`service-framework-iwsdk`](https://www.npmjs.com/package/@realitycollective/service-framework-iwsdk) | Meta IWSDK (WebXR) frame source |
| [`service-framework-client`](https://www.npmjs.com/package/@realitycollective/service-framework-client) | React + three.js, already wired together |

### Writing your own binding

An adapter for a host nobody has covered yet has to behave exactly as the bindings above do, or a service that passes its unit tests stops behaving the same way on a headset. `runtimeAdapterContractCases()` is the set of checks that says so, shipped as data rather than as a test file so it can run in your repository under your own runner. Each case returns silently on success and throws a plain `Error` describing the failure otherwise:

```ts
import { runtimeAdapterContractCases } from "@realitycollective/service-framework";

for (const contractCase of runtimeAdapterContractCases()) {
  it(contractCase.name, () => contractCase.run(makeSubject()));
}
```

`makeSubject()` returns a `RuntimeAdapterSubject`: your adapter, plus a `RuntimeAdapterDriver` that pushes a frame, sets capability flags and - if your host owns sessions - starts and ends one. Build a fresh subject per case, because the session cases drive a session through its whole lifecycle. Some cases are asynchronous, so the runner has to await what `run` returns. An adapter with no session facet passes the session cases without running them, since `session` is optional.

Every adapter must also expose `setCapabilities(partial: Partial<AdapterCapabilities>)`, a sticky override layer on top of whatever the adapter derives from its host. An override wins for as long as it is set and survives every later derivation. An adapter that derives its capabilities also exposes `clearCapabilityOverrides()`, which drops every override and falls back to the derived values. `setCapabilities` notifies subscribers when the effective capabilities change. The conformance suite needs it: the driver's `capabilities` hook is wired to `adapter.setCapabilities`, because an adapter that only derives from a live host cannot flip a flag on demand. `IWSDKAdapter`, `WebXRRuntimeAdapter`, `BabylonRuntimeAdapter` and `MockRuntimeAdapter` all expose it. It is not on the `RuntimeAdapter` interface, so services must not call it. It is for the host application and for tests.

## Host requirements

The core assumes only these globals from its host, beyond the ECMAScript language itself. A host that embeds a bare JavaScript engine, such as Hermes, must supply them.

| Global | Used by | When |
| --- | --- | --- |
| `setTimeout`, `clearTimeout` | `ServiceManager.resolveAsync`, `ServiceManager.waitUntilInitialized` and `MockRuntimeAdapter`'s session request | Only when those are called. Each arms one timeout and clears it when the wait settles. |
| `setInterval`, `clearInterval` | `TimerScheduler` | Only when it is constructed without `setIntervalFn` and `clearIntervalFn`. `ServiceManager` uses `ManualScheduler` by default, which needs neither. |

Two globals are used when present and are never required. `ServiceManager` uses the host's `AbortController` for each service's `signal`, and falls back to a small built-in one without it. `createWebHostIO()` reads `fetch` and `DecompressionStream` only when its methods are called; a host without them passes the `HostIO` its own binding provides, as `@realitycollective/service-framework-native` does.

Nothing else is assumed. The core does not read `window`, `document`, `navigator`, `performance`, `requestAnimationFrame` or `queueMicrotask`. `TimerScheduler` drives the render channel only through a `requestAnimationFrameFn` you pass it. The host bindings are different: each one reads its own engine or browser, and a native host brings its own binding.

## Live examples

- Weather client walkthrough: **[service-framework-weather.pages.dev](https://service-framework-weather.pages.dev)**
- Client runtime reference: **[service-framework-client-app.pages.dev](https://service-framework-client-app.pages.dev)**

## Documentation

Architecture, service authoring and consumption patterns are documented in the [repository](https://github.com/realitycollective/com.realitycollective.service-framework.ts#readme), including a [Unity-to-web migration guide](https://github.com/realitycollective/com.realitycollective.service-framework.ts/blob/main/documentation/Migration-Unity-to-Web.md). A runnable example ships in this package's `Examples/` folder.

## License

MIT - see [LICENSE](./LICENSE).
