# @realitycollective/service-framework-three

**three.js bindings** for the Reality Collective TypeScript Service Framework - a render-loop bridge that connects `renderer.setAnimationLoop()` to the framework's `renderTick` scheduler channel, and a WebXR runtime adapter that gives a three.js or desktop app the same `RuntimeAdapter` surface the IWSDK binding has.

```sh
npm install @realitycollective/service-framework @realitycollective/service-framework-three
```

Services written against `BaseService<TConfig>` run unchanged on three.js, Babylon.js or IWSDK - only the bridge differs. `three` is not a dependency of this package: every host type is structural, so the bindings build and unit-test with no renderer, no WebXR and no headset.

## Render loop

```ts
import { ManualScheduler, ServiceManager, createServiceProfile } from "@realitycollective/service-framework";
import { ThreeRenderLoopBridge } from "@realitycollective/service-framework-three";
import { WebGLRenderer } from "three";

const scheduler = new ManualScheduler();
const manager = new ServiceManager({ scheduler });

manager.initializeProfile(createServiceProfile("my-app", [/* your service registrations */]));
manager.start();

const renderer = new WebGLRenderer({ canvas });
const bridge = new ThreeRenderLoopBridge({ scheduler, host: renderer });
bridge.start();
// Every three.js frame now emits renderTick to all registered services.
```

`host` is anything with `setAnimationLoop` (the `AnimationLoopHostLike` interface), so a `WebGLRenderer`, `WebGPURenderer` or a test double all work.

## WebXR runtime adapter

`RuntimeAdapter` is the seam a service depends on to reach its host: per-frame updates, XR capability flags, and session lifecycle. `WebXRRuntimeAdapter` implements it over the entry points a browser already provides - `navigator.xr` to negotiate a session, `renderer.xr` for the session the renderer presents, and `setAnimationLoop` for frames. It orchestrates those; it renders nothing, plays nothing and owns no scene state.

```ts
import { ManualScheduler, ServiceManager } from "@realitycollective/service-framework";
import { WebXRRuntimeAdapter } from "@realitycollective/service-framework-three";
import { WebGLRenderer } from "three";

const manager = new ServiceManager({ scheduler: new ManualScheduler() });
const renderer = new WebGLRenderer({ canvas });
renderer.xr.enabled = true;

const adapter = new WebXRRuntimeAdapter({
  xr: renderer.xr,
  host: renderer,
  scheduler: manager.scheduler,
  sessionInit: () => ({ optionalFeatures: ["hand-tracking"] })
});

adapter.start();

document.querySelector("#enter-vr")?.addEventListener("click", async () => {
  const result = await adapter.session.request("immersive-vr");

  if (!result.ok) {
    // "unsupported" | "denied" | "timeout" | "error" - a normal runtime
    // outcome, so it comes back as a result rather than a thrown error.
    showEnterVrError(result.reason);
  }
});
```

Pass the adapter to your services (through their configuration, or a token you register it under) and they read `adapter.onFrame`, `adapter.getCapabilities` and `adapter.session` without knowing three.js exists.

### Owning the loop

Given a `host`, the adapter owns the animation loop: `start()` binds it, `stop()` releases it, and each callback becomes one `FrameInfo` - `timestamp` in milliseconds, `delta` in seconds. Given a `scheduler` as well, the same callback also emits `renderTick` with `source: "three"` and `deltaTime` in milliseconds, exactly as `ThreeRenderLoopBridge` does, so an app needs one loop owner rather than two. Use the adapter or the bridge, not both.

three.js routes `setAnimationLoop` through the session's own `requestAnimationFrame` while presenting, so one call covers both the 2D page and the headset.

Omit `host` to keep the loop yourself and call `adapter.emitFrame(timestamp, delta)` per frame.

### Sessions

`adapter.session` is the optional session facet from `RuntimeAdapter`. `request` never rejects - a headset that is absent, refused or broken is a normal runtime condition, so every outcome is a result:

| Outcome | When |
| --- | --- |
| `{ ok: true }` | the session started, or one was already active |
| `unsupported` | there is no `navigator.xr`, or `isSessionSupported(mode)` resolved false |
| `denied` | the request failed with `NotAllowedError` or `SecurityError` - the user, the prompt or the permissions policy refused |
| `timeout` | nothing arrived within `timeoutMs` (default 10000) |
| `error` | anything else, with the original error attached |

`getState()` walks `"none"` -> `"requesting"` -> `"active"` -> `"ending"` -> `"none"`. `end()` calls `session.end()` and resolves once the session is gone. `onVisibilityChange` maps the session's `visibilitychange` onto `"visible"`, `"visible-blurred"` and `"hidden"`, and reports `"non-immersive"` whenever there is no session. A value the adapter does not recognise is reported as `"hidden"`, because treating an unknown state as visible would keep game logic running when it should not.

`sessionInit` supplies the `XRSessionInit` per mode - required and optional features - and is called once per request. The default sends none.

One request can add features of its own through `SessionRequestOptions`, which matters when an app swaps mode mid-session and the host's defaults were chosen for the mode it is leaving:

```typescript
await adapter.session.request("immersive-ar", {
  requiredFeatures: ["hit-test"],
  optionalFeatures: ["plane-detection"],
});
```

They are merged over what `sessionInit` returned rather than replacing it: host entries come first, the request's are appended, and a feature named twice appears once. A request that names none passes the hook's result through untouched. The merge is the core's `mergeSessionInit`, shared with the Babylon binding so the two cannot drift.

### Capabilities

The adapter derives `immersive`, `handTracking`, `planeDetection`, `passthrough` and `environmentBlendMode` from the live session with the core's shared `deriveCapabilities`, which is the same derivation the IWSDK adapter uses. It re-derives when the renderer raises `sessionstart` or `sessionend` and when the session raises `inputsourceschange`, and notifies subscribers only when a flag actually changes. `refreshCapabilities()` re-reads the renderer on demand, for a host that changes what it presents without raising anything.

`setCapabilities({ ... })` is a manual override layer on top: an override wins for as long as it is set, survives every later derivation, and is dropped by `clearCapabilityOverrides()` or `dispose()`.

### The same adapter on the desktop

A desktop build with no headset needs no special case. `request` returns `{ ok: false, reason: "unsupported" }` where the browser has no `navigator.xr` or does not support the mode, capabilities stay at the all-false defaults, and frames keep arriving from the same loop. Services gate on `getCapabilities()` and run either way.

### API surface

| Symbol | Kind | Purpose |
| --- | --- | --- |
| `ThreeRenderLoopBridge` | class | `renderer.setAnimationLoop()` to `renderTick`; `start`, `stop`, `dispose`. |
| `ThreeRenderLoopBridgeOptions` | interface | `{ scheduler, host }`. |
| `AnimationLoopHostLike` | interface | Anything with `setAnimationLoop`. |
| `FIRST_FRAME_DELTA_MS` | const | 16 - the delta reported for the first frame. |
| `WebXRRuntimeAdapter` | class | `RuntimeAdapter` over WebXR; `start`, `stop`, `emitFrame`, `getSession`, `refreshCapabilities`, `setCapabilities`, `clearCapabilityOverrides`, `session`, `dispose`. |
| `WebXRRuntimeAdapterOptions` | interface | `{ xr, xrSystem?, host?, scheduler?, sessionInit? }`. |
| `WebXRManagerLike` | interface | The slice of `renderer.xr` the adapter drives. |
| `WebXRSystemLike` | interface | The slice of `navigator.xr` it negotiates through. |
| `WebXRSessionLike` | interface | The slice of `XRSession` it reads. |
| `WebXRManagerEventType` / `WebXRSessionEventType` / `WebXREventListener` | types | The host events it subscribes to. |

## Live examples

- Weather client walkthrough: **[service-framework-weather.pages.dev](https://service-framework-weather.pages.dev)**
- Client runtime reference: **[service-framework-client-app.pages.dev](https://service-framework-client-app.pages.dev)**

## Documentation

See the [repository README](https://github.com/realitycollective/com.realitycollective.service-framework.ts#readme) and this package's `Examples/` folder.

## License

MIT - see [LICENSE](./LICENSE).
