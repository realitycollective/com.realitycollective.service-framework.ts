# Service Framework TypeScript expansion design

## Summary

The TypeScript delivery keeps the Service Framework as a **single conceptual framework**:

- `ServiceManager` remains the central registry and lifecycle router
- `BaseService` remains the primary authoring surface
- `BaseServiceModule` remains the parent-owned sub-service pattern
- constructor-driven DI remains the default composition model
- event services are supported directly through `BaseEventService`

## Key decisions

### 1. Centralized core, not per-platform rewrites

The TypeScript runtime is the framework. React and three.js integrations are thin bindings over the same core manager, tokens, schedulers, and service contracts.

**Why:** this keeps migration cost and documentation churn low while preserving the current identity of the framework.

### 2. Tokens replace runtime interfaces

TypeScript interfaces do not exist at runtime, so service identity uses strongly typed tokens.

**Why:** this is the cleanest TypeScript equivalent to the current C# "resolve by interface" model.

### 3. Scheduler abstractions replace engine callbacks

Lifecycle is mapped through scheduler channels:

- startup
- tick
- lateTick
- fixedTick
- renderTick
- focusChange
- pauseChange

**Why:** web platforms do not provide Unity's callback surface, so the framework must own the abstraction.

### 4. Service modules are supported directly

Modules are still registered as parent-owned sub-services with their own config and lifecycle.

**Why:** this is a meaningful differentiator of the current framework and important for continuity.

### 5. Standards-first event and host integration

The core owns the event-service contract while integrations can bridge to host runtimes such as React and three.js.

**Why:** host-specific behavior is isolated, but the framework contract stays consistent.

## Package breakdown

## `@realitycollective/service-framework`

Contains:

- contracts
- tokens
- environment descriptors
- manual and timer schedulers
- `ServiceManager`
- `BaseService`
- `BaseServiceModule`
- `BaseEventService`
- configuration helpers
- `RuntimeAdapter` - the host-runtime seam: frames, capabilities and an optional session facet
- `SnapshotService` - the state-owning service base
- `MockRuntimeAdapter` - the headless adapter services are unit-tested against
- `deriveCapabilities` - the capability rules every host binding shares, over the structural `CapabilitySessionLike`

`RuntimeAdapter`, `SnapshotService` and `MockRuntimeAdapter` arrived in the IWSDK package and moved into the core in 1.0.1, because none of them ever touched IWSDK and every host binding needs them. The IWSDK package re-exports them, so existing imports still resolve. `deriveCapabilities` is new in 1.0.1: the IWSDK adapter derived the flags privately, and a second adapter would have re-implemented the same rules.

## `@realitycollective/service-framework-react`

Contains:

- `ServiceFrameworkProvider`
- `useServiceManager`
- `useService`
- `useServices`

## `@realitycollective/service-framework-three`

Contains:

- `ThreeRenderLoopBridge`
- `WebXRRuntimeAdapter` - a `RuntimeAdapter` over `navigator.xr` and `renderer.xr`, so a three.js or desktop app reaches the same seam the IWSDK binding exposes. It orchestrates the platform's own session and frame entry points; it renders nothing and owns no scene state.
- the structural host contracts the adapter is typed against: `WebXRManagerLike`, `WebXRSystemLike`, `WebXRSessionLike`

## `@realitycollective/service-framework-babylon`

Contains:

- `BabylonRenderLoopBridge`
- `BaseBabylonService` - the optional base for a service handed an engine and a scene
- `BabylonRuntimeAdapter` - a `RuntimeAdapter` over Babylon's `WebXRDefaultExperience`, so a Babylon app reaches the same seam the three.js and IWSDK bindings expose. It orchestrates Babylon's own session and frame entry points; it renders nothing and owns no scene state.
- the structural host contracts the adapter is typed against: `BabylonXRExperienceLike`, `BabylonSessionManagerLike`, `BabylonXRSessionLike`, `BabylonObservableLike`

The two engine packages do not depend on each other, so the raw `XRSession` shape is declared once in each rather than shared. `BabylonRuntimeAdapter` and `WebXRRuntimeAdapter` carry the same members with the same semantics, and both run the shared runtime-adapter conformance suite, so a consumer moving between renderers sees no behavioural difference at this seam.

## `@realitycollective/service-framework-client`

Contains:

- a pre-wired client runtime for React + three.js applications
- pre-built state services and runtime helpers
- re-exports the full surface of the core, React, and three.js packages

## Code layout

```text
packages/
  service-framework/
    src/
    test/
    Examples/
    plain-web
  service-framework-react/
    src/
    test/
    Examples/
    React
  service-framework-three/
    src/
    test/
    Examples/
    three.js
  service-framework-client/
    src/
    test/
    Examples/
    React + three.js
documentation/
runtime-examples/
```

## Investment areas baked into the implementation

- strict diagnostics for duplicate registration and missing services
- async resolution and initialization waiting
- scheduler-backed lifecycle routing
- multi-registration support by token and service name
- exhaustive tests with 100% coverage thresholds
