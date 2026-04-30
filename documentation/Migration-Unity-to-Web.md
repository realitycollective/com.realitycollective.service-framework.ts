# Migration guide: Unity Service Framework to TypeScript web framework

## Concept mapping

| Unity framework concept | TypeScript equivalent |
| --- | --- |
| `ServiceManager` | `ServiceManager` |
| `BaseService` | `BaseService` |
| `BaseServiceModule` | `BaseServiceModule<TParent>` |
| interface lookup | typed service tokens |
| Scriptable profiles | typed service profiles / manifests |
| Unity frame callbacks | scheduler channels |
| EventSystem event services | `BaseEventService` plus host bridges |
| platform classes | environment capabilities |

## What carries over directly

- central manager pattern
- explicit registration
- service priority
- service modules
- lifecycle-based services
- constructor-driven DI
- async waiting for framework readiness

## What changes

### Runtime identity

Unity can resolve interfaces through runtime reflection. TypeScript cannot, so services use tokens.

### Lifecycle transport

Unity supplies `Update`, `LateUpdate`, and `FixedUpdate`. On the web, those are delivered through schedulers and host bridges.

### Configuration

ScriptableObject authoring is replaced by TypeScript or JSON-friendly configuration manifests.

### Events

Unity `GameObject` listeners are replaced with typed framework event services and optional host bridges.

## Suggested migration flow

1. map each Unity service interface to a token
2. move service behavior into `BaseService` implementations
3. translate profile assets into service profile objects
4. express constructor dependencies explicitly in registration metadata
5. move engine-loop assumptions into scheduler or bridge configuration
6. move Unity event plumbing into `BaseEventService` and host integrations

## Practical advice

- migrate behavior first, host integration second
- preserve service names and priorities where possible
- keep module boundaries intact
- treat schedulers as the web equivalent of Unity's frame loop
- keep React and three.js as thin consumers of the same core services
