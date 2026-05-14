# Service Framework TypeScript expansion design

## Summary

The TypeScript delivery keeps the Service Framework as a **single conceptual framework**:

- `ServiceManager` remains the central registry and lifecycle router
- `BaseService` remains the primary authoring surface
- `BaseServiceModule` remains the parent-owned sub-service pattern
- constructor-driven DI remains the default composition model
- event services remain first-class through `BaseEventService`

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

### 4. Service modules stay first-class

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

## `@realitycollective/service-framework-react`

Contains:

- `ServiceFrameworkProvider`
- `useServiceManager`
- `useService`
- `useServices`

## `@realitycollective/service-framework-three`

Contains:

- `ThreeRenderLoopBridge`

## `@realitycollective/service-framework-client`

Contains:

- opinionated client runtime composition for React + three.js applications
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
