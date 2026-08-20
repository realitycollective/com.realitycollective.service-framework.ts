# Changelog

Change log for the Reality Collective Service Framework for TypeScript. All packages in this repository are versioned and released together; the version below is the one carried by the `v<version>` release tag.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Preview builds are not listed separately. The entry for a version accumulates while its previews are published, and is dated when that version is released.

## [1.0.1]

Packaging, tooling and documentation. No runtime behaviour changed, and no public API was added, removed or altered.

### Added

- Updated documentation packs for all projects.
- Improved release scripting and validation to improve delivery coherance.
- `scripts/release.config.json` - names the core package and the publish order, so the release tooling is identical across every Reality Collective TypeScript repository.
- A deploy stage in CI for `runtime-examples/*`, which were never built by CI before.
- `.gitattributes`, pinning the repository to LF and marking lockfiles as generated.

### Changed

- CI and deployment merged into one workflow. They previously ran concurrently and repeated the same install, build, typecheck and test on every pull request. The deploy jobs now consume the artifacts the build job already produced.
- CI runs on every pull request regardless of target branch, and reports through merge queues.
- Published sourcemaps embed their sources (`inlineSources`), so stepping into the framework works for consumers. Declaration maps are no longer emitted, because they can only resolve against a `src` directory that is not shipped. Each package is roughly 12% smaller as a result.

### Fixed

- `runtime-examples/*` white-screened with `Cannot read properties of null (reading 'useMemo')`. The Vite aliases point into `../../packages`, so the framework's React binding resolved React from the repository root while the app used its own copy. Two React instances leave the hook dispatcher null. Both example configs now set `resolve.dedupe`.

### Removed

- Build output is no longer committed: 72 files under `packages/*/dist/` and 44 compiled `.js`, `.d.ts` and `.map` files that sat beside the sources in `packages/*/src/`. The test suite had been executing that committed JavaScript rather than the TypeScript, so coverage now measures `src/**/*.ts`.
- The generated `coverage/` report, which every test run rewrote with a new timestamp.

## [1.0.0] - 2026-06-18

First release. Six packages, published together.

### Added

- `@realitycollective/service-framework` - the core runtime: `ServiceManager` with dependency-ordered start and stop, `BaseService` and `BaseServiceModule`, type-safe resolution through `createServiceToken`, the scheduler channels, an event service for service-to-service messaging, profile-based configuration and environment description.
- `@realitycollective/service-framework-react` - `ServiceFrameworkProvider` plus the `useServiceManager`, `useService` and `useServices` hooks.
- `@realitycollective/service-framework-three` - `ThreeRenderLoopBridge`, connecting `renderer.setAnimationLoop()` to the `renderTick` channel. Accepts anything with `setAnimationLoop`, so a renderer or a test double both work.
- `@realitycollective/service-framework-client` - the React and three.js pieces wired together, so an app starts from a working runtime instead of assembling the scheduler and bridge by hand.
- `@realitycollective/service-framework-babylon` - Babylon.js bindings, connecting `engine.runRenderLoop()` to the same `renderTick` channel the three.js bridge uses. A service written against `BaseService<TConfig>` runs unchanged on either renderer.
- `@realitycollective/service-framework-iwsdk` - Meta IWSDK (WebXR) bindings. IWSDK owns its own render loop, so this package is a passive frame source: one system relays each frame to services and maps `visibilityState` onto focus and pause, so services pause when the headset comes off. Services depend only on `RuntimeAdapter`, never on `@iwsdk/core`.
- A worked example in every package's `Examples/` folder, and two runnable Vite apps in `runtime-examples/`.

[1.0.1]: https://github.com/realitycollective/com.realitycollective.service-framework.ts/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/realitycollective/com.realitycollective.service-framework.ts/releases/tag/v1.0.0
