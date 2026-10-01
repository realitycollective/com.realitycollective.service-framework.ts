# Native test harness (Service Framework)

A native app built from this repository's own source that runs the Service Framework's shared suites against a real native host on the device, and shows the framework running for a person wearing the headset. It exists so a defect in a native host, or in the native binding, is found here before a client project runs into it.

The harness is a project for the WebXR-to-native conversion pipeline (the Reality Collective's `WebXR-Native-Pipeline` repository): `app.json` describes it, `entry.ts` is its native entry and `ui/service-board.uikitml` is the panel, `scene-assets.ts` and `scenes/` are the blocks, and `files/harness.txt` is the packed file. The pipeline bundles the entry to Hermes bytecode through its gates (no engine code in the bundle, only the host-profile globals), packs the file under the app's assets, generates the Android project and builds the APK. Nothing in the pipeline names this project; it is handed this folder.

## Modes

The shell launches the app with `debug.rc.mode` set (`adb shell setprop debug.rc.mode kits`); a runner under Node sets `__rcShell.mode` before it loads the bundle.

| Mode | What runs | Where the result goes |
| --- | --- | --- |
| `kits` | `runtimeAdapterContractCases()` over `NativeRuntimeAdapter`, `renderTickContractCases()` over `NativeRuntimeAdapter` with a `ManualScheduler`, `hostIOContractCases()` over `createNativeHostIO`, and a check that a profile boots and disposes with no global `AbortController`, against `__rcShell.testHost` on a device or the reference fake under Node | one JSON line per suite (`step: "suite"`), then `step: "done"` with `pass` and every failure named |
| `play` | the service board over the live `__rcHost`: a `ServiceManager` over a `NativeRuntimeAdapter` and six services, each owning a visible thing: a text panel and a row of blocks | the board in the headset, one JSON line per lifecycle change as it happens, a `status` line once a second, an `io` line every 10 seconds |

`kits` is the default with no native host, `play` the default on a device.

## Playing it

The person wearing the headset sees the service board: a text panel about 1.4 m ahead at eye height, facing the viewer, and a row of seven blocks below it. Each thing on it is owned by a real service in one profile (`src/board.ts`), so what is on screen is the framework running. The board is placed once, from the viewer's head pose when the session first goes live. Every change is also written to the log as a JSON line, read with `adb logcat`.

The panel is `ui/service-board.uikitml`. Its lines are session state and mode, visibility, focused, paused, `renderTick` calls in the last second, the mean frame delta, tick counts for the four scheduler channels, the four capability flags, the last three telemetry records and the last byte I/O read with its time.

The blocks, left to right, and what each means:

| Block | Owner | What it shows |
| --- | --- | --- |
| Orange cube | `SpinService`, in `render` | Spins only while `renderTick` fires. It freezes when the session is unfocused or paused, because the adapter delivers `renderTick` only to a focused session. |
| Teal cube | `PulseService`, in `fixedUpdate` | Hops once a second from a timer channel. It keeps hopping while the session is unfocused, which is the difference from the orange cube. |
| Blue sphere | `CapabilityBlocksService` | Shown while `immersive` is true. |
| Green cylinder | `CapabilityBlocksService` | Shown while `handTracking` is true. Put the controllers down and use bare hands to make it appear. |
| Purple slab | `CapabilityBlocksService` | Shown while `planeDetection` is true. |
| Pink ring | `CapabilityBlocksService` | Shown while `passthrough` is true. |
| Yellow gem | `IoFlashService` | Appears for about 0.7 seconds each time a `HostIO` read completes, every 10 seconds. |

Log lines: `event` lines carry `at` (the display time in milliseconds) and a `type`: `session`, `visibility`, `focus`, `pause`, `capabilities`, `telemetry`, `placed` and `display`. A `display` event names a slice the host did not provide (`ui`, `scenes` or `interactions.setWorldPose`) or a call that failed; the rest of the board keeps working. A `status` line follows once a second with `frames`, `ticks`, `avgDeltaMs`, the session state, the host's OpenXR state, the visibility, the capability flags and the count of each channel. An `io` line follows every 10 seconds with the text of `files/harness.txt`, read through `HostIO`, or the error.

| Action | On the board | Log lines to expect |
| --- | --- | --- |
| Put the headset on | The board appears. The blue sphere shows, the orange cube starts to spin, `focused: yes`, `paused: no`. | `session` (`active`), `capabilities` (`immersive` true), `visibility` (`visible`), `focus` (true), `pause` (false), `placed` |
| Take the headset off | The orange cube freezes and `renderTick per second` falls to 0, while the teal cube keeps hopping. | `visibility` (`visible-blurred` or `hidden`), `focus` (false), `pause` (true); a later `session` (`none`) if the host ends the session |
| Open the system menu | The same as taking the headset off. Closing the menu makes the orange cube spin again. | `visibility` (`visible-blurred`), `focus` false, `pause` true; on closing `visible`, `focus` true, `pause` false |
| Switch between hands and controllers | The green cylinder shows when hands are active and hides for controllers. | a `capabilities` event where `handTracking` changes, when the host reports it through the `input` slice or the session's features |
| Wait 10 seconds | The yellow gem flashes and the byte I/O line changes its time. | an `io` line with `ok: true` and the text of `harness.txt`; `ok: false` names the failure |

## Building

CI compiles the harness and never runs it: a native build runs only on a developer's machine or a headset.

```
npm run harness:compile
```

That typechecks the harness, bundles `entry.ts` with esbuild (no browser, no engine, the host-profile gate) to `build/node/harness.js`, and compiles the bundle to Hermes bytecode with the flags the pipeline uses, so a bundle the device's engine would refuse fails the build. `--require-hermes` fails when `hermes-compiler` is missing instead of skipping that step; CI passes it.

The browser-global gate refuses a bundle that names `window`, `document`, `navigator`, `fetch`, `XMLHttpRequest`, `requestAnimationFrame`, `localStorage` or `Intl` as a free identifier. The core reads `fetch`, `DecompressionStream` and `AbortController` only as properties of `globalThis` (see the "Host requirements" section of the core package README), which the gate allows, and text inside a quoted string is not counted.

With no `__rcHost` installed, the bundle uses this repository's reference fake (`src/fakes.ts`), the same in-memory host the native package's own suites prove the adapter against, so a local runner can load it in Node and drive `__rcTick` to prove the suites pass on the fake.

For a device, the conversion pipeline builds the APK from `app.json` (`rc check`, `rc assets`, `rc build --target quest`). The cook of the panel and of the blocks runs in the pipeline with the pipeline's own `@drawcall/uikitml`, `three` and `@iwsdk/core`: this repository installs none of them. After changing `src/blocks.ts`, run `npm run harness:scenes` to rewrite the scene document. The pipeline takes the Service Framework packages from this repository's `node_modules`, which link to `packages/`, so the harness is built from this working tree once `npm run build` has run. Nothing is copied over an install.

## What the shell must provide

The root contract of `@realitycollective/service-framework-native` (`native-host.ts`): `__rcHost` with `onFrame`, `getSessionInfo`, `onSessionChange`, `requestSession`, `endSession` and the optional `io` slice, and the frame entry `__rcTick(displayMs)` called once per frame. For `kits`, `__rcShell.testHost` is a second host object with the same members plus four drivers: `hostStart()` (a session begins and takes focus), `hostEnd()` (the session ends), `injectFrame(timestampMs, deltaSeconds)` and `serveBytes(url, bytes)`. `play` needs the `ui`, `scenes` and `interactions` slices (`createWindow`, `onPanelReady`, `applyWindow`, `setWindowPose` and `setProperties`; `build` and `setNodeActive`; `setWorldPose`), the cooked `/ui/service-board.uikitml` and `/scenes/sf-board.iwsdk.scene.json`, and `input.getHeadPose` to place the board (without it the board is placed at a standing pose after two seconds). It reads `files/harness.txt` at the asset path `harness.txt`, packed by `content.files` in `app.json`. A missing slice is logged and the rest keeps working.

## Output

Everything the compile and the pipeline write goes under `build/`, which is ignored. Device logs and results are kept outside this repository.
