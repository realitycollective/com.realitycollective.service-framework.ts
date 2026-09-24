# `@realitycollective/service-framework-native`

Native host bindings for the [Reality Collective TypeScript Service Framework](https://github.com/realitycollective/com.realitycollective.service-framework.ts).

A native XR app, such as an OpenXR app on Quest or a CompositorServices app on visionOS, can embed a JavaScript engine such as Hermes and run the same services a WebXR app runs. The app owns the session, the frame loop, rendering and physics. This package gives those services the same `RuntimeAdapter` seam the IWSDK, three.js and Babylon.js bindings give them, plus the byte I/O they need to read assets. Services do not change between web and native.

---

## The host object

The native app installs one object, `globalThis.__rcHost`, before it evaluates the bundle. Everything crosses it as plain values: numbers, strings, arrays, plain objects and `Uint8Array`. The only functions that cross are listener callbacks, and each `on*` method returns an unsubscribe function.

```ts
globalThis.__rcHost = {
  onFrame(callback: (timestampMs: number, deltaS: number) => void): () => void,   // after xrWaitFrame
  getSessionInfo(): NativeSessionInfo,
  onSessionChange(callback: (info: NativeSessionInfo) => void): () => void,
  requestSession(mode: "immersive-vr" | "immersive-ar", optionsJson: string): void,
  endSession(): void,
  io?: { fetchBytes(url: string): Promise<Uint8Array>; gunzip(bytes: Uint8Array): Promise<Uint8Array> },
};
```

`NativeSessionInfo` carries the OpenXR session state name, the enabled extensions, whether the system supports hand tracking, and the blend mode.

Each other Reality Collective family reads its own optional slice of the same object through its own native package: `input` and `interactions` in `@realitycollective/native-interactions`, `ui` in `@realitycollective/native-uiextensions`, and `environment`, `audio` and `sensing` in `@realitycollective/native-environment`.

## Quick start

```ts
import { ServiceManager, TimerScheduler } from "@realitycollective/service-framework";
import { NativeRuntimeAdapter, createNativeHostIO } from "@realitycollective/service-framework-native";

const scheduler = new TimerScheduler();                    // needs setInterval, or pass setIntervalFn
const adapter = new NativeRuntimeAdapter({ scheduler });   // reads globalThis.__rcHost
const io = createNativeHostIO();                           // HostIO over __rcHost.io
```

Pass `host` to use an injected object instead of the global, as tests do.

## Runtime adapter

`NativeRuntimeAdapter` implements `RuntimeAdapter` with the session facet, and passes the shared `runtimeAdapterContractCases()`.

- **Frames.** Every host frame reaches `onFrame` subscribers. Given a `scheduler`, it also emits `renderTick` with `source: "native"`, in milliseconds, as the other bindings do.
- **Capabilities.** Derived from the session info. `immersive` is true in the `synchronized`, `visible` and `focused` states. `handTracking` needs both `XR_EXT_hand_tracking` and system support. `passthrough` and `environmentBlendMode` follow the blend mode. `setCapabilities` adds sticky overrides, `clearCapabilityOverrides()` drops them, and `refreshCapabilities()` re-reads the host.
- **Sessions.** `request(mode, options)` sends the options to the host as JSON and resolves when the host reports a session, or with `timeout`. `end()` resolves once the host reports `none`. OpenXR states map to visibility: `focused` is `visible`, `visible` is `visible-blurred`, `synchronized` is `hidden`, and anything else is `non-immersive`.
- **Dispose.** `dispose()` drops the host subscriptions and settles anything in flight. It does not end the session.

## Byte I/O

`createNativeHostIO()` returns the core's `HostIO` over `__rcHost.io`. The core's `createWebHostIO()` returns the same interface over `fetch` and `DecompressionStream`. Code written against `HostIO`, and the core's `fetchText`, `fetchJson` and `fetchMaybeGzipped` helpers, run unchanged on both. This is transport only. The native app decodes images, audio and models with its own loaders, so a `src` string means the same thing on web and native.

## Host globals

Beyond the host object, the core needs `setTimeout` and `clearTimeout` from the engine's host. `AbortController` is optional: without it the manager uses a built-in fallback. A `TimerScheduler` needs `setInterval` and `clearInterval`, unless you pass your own as above. On React Native's build of Hermes, promise jobs also need `setImmediate`.

## Running tests

From the repository root:

```sh
npm test
```

The tests run against an in-memory fake of `__rcHost` in `test/helpers/fake-native-host.ts`. A run on a device is the native app's step.

## License

MIT
