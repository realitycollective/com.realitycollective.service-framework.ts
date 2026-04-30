# Web implementation and usage

## Core concepts

### Service tokens

Every service is identified by a typed token:

```ts
import { createServiceToken } from "@realitycollective/service-framework";

export const LOGGER_TOKEN = createServiceToken<LoggerService>("LoggerService");
```

### Services

Create services by extending `BaseService`:

```ts
import { BaseService } from "@realitycollective/service-framework";

export class LoggerService extends BaseService<{ level: "info" | "debug" }> {
  override initialize(): void {
    console.log(`Logger ready at ${this.serviceConfig.level}`);
  }
}
```

### Modules

Modules extend `BaseServiceModule<TParent>`:

```ts
import { BaseServiceModule } from "@realitycollective/service-framework";

export class AnalyticsModule extends BaseServiceModule<AppService, { sampleRate: number }> {}
```

### Registration

Register services through a profile:

```ts
import { ServiceManager, createServiceProfile } from "@realitycollective/service-framework";

const manager = new ServiceManager();

manager.initializeProfile(createServiceProfile("app", [
  {
    token: LOGGER_TOKEN,
    config: { level: "debug" },
    useClass: LoggerService
  }
]));

manager.start();
```

### Dependency injection

Dependencies are declared explicitly in registration:

```ts
{
  token: APP_TOKEN,
  dependencies: [LOGGER_TOKEN],
  useClass: AppService
}
```

The constructor receives:

1. activation context
2. resolved dependency instances in the declared order

### Lifecycle

Scheduler channels route to familiar service hooks:

- `initialize`
- `start`
- `reset`
- `update`
- `lateUpdate`
- `fixedUpdate`
- `render`
- `destroy`
- `onFocusChange`
- `onPauseChange`

`TimerScheduler` gives a browser-friendly default when you need a runtime loop.

## React usage

Wrap your tree in `ServiceFrameworkProvider` and use hooks:

```tsx
<ServiceFrameworkProvider profile={profile}>
  <App />
</ServiceFrameworkProvider>
```

```tsx
const logger = useService(LOGGER_TOKEN);
```

## three.js usage

Bridge an animation loop host into the scheduler:

```ts
const bridge = new ThreeRenderLoopBridge({
  scheduler: manager.scheduler,
  host: renderer
});

bridge.start();
```

Services that implement `render()` will now receive `renderTick` lifecycle calls.

## Recommended packaging guidance

- keep framework behavior in the core package
- move only host-specific bindings into integration packages
- keep examples close to the core package to reduce onboarding friction
