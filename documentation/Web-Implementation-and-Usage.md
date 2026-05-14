# Web implementation and usage

This guide explains how to use the TypeScript Service Framework as a teaching guide, not just an API reference. It is written for developers who may be new to TypeScript, React, or service-based application design.

If you are completely new to this style of application, read the sections in order:

1. architecture and mental model
2. service design and implementation
3. service consumption in plain TypeScript and React
4. advanced use cases

The step-by-step weather client walkthrough is in a separate document: [Weather-Client-Walkthrough.md](./Weather-Client-Walkthrough.md). A ready-to-run version of the same example lives at [runtime-examples/weather-client-example](../runtime-examples/weather-client-example/README.md).

## A quick TypeScript glossary

If some of the TypeScript syntax is unfamiliar, these are the only terms you need for this guide:

- `class`: a blueprint for creating an object
- `extends`: says one class builds on another
- `interface`: a type that describes the shape of some data
- `readonly`: a value that should not be reassigned after creation
- `<T>`: a generic type placeholder that lets code stay strongly typed

You do not need to master all of TypeScript before using the framework. The most important idea is that the framework uses types to make service registration and service lookup safer.

## General architecture: core plus extensions

The framework is built around one central idea: keep application behavior in services, and keep host-specific code thin.

### Core package

`@realitycollective/service-framework` is the runtime core. It contains the pieces that every application builds on:

- `ServiceManager`: creates, initializes, starts, resolves, and disposes services
- `BaseService`: the normal base class for most services
- `BaseServiceModule`: a child-service pattern for features that belong to a parent service
- `BaseEventService`: a base class for services that publish and subscribe to typed events
- service tokens: runtime identifiers for services
- service profiles: registration manifests for your application
- schedulers: lifecycle delivery for startup, update, fixed update, render, focus, and pause
- environment descriptors: capability information such as `dom`, `geolocation`, or `webgl`

### Extension packages

The extension packages are intentionally thin. They do not replace the core runtime. They connect the same core runtime to a particular host.

| Package | Responsibility | Use it when |
| --- | --- | --- |
| `@realitycollective/service-framework-react` | React provider and hooks | your UI is built with React |
| `@realitycollective/service-framework-three` | three.js render loop bridge | you want `render()` services to run from a three.js animation loop |
| `@realitycollective/service-framework-client` | opinionated client runtime composition for React + three.js applications | you want a higher-level runtime package instead of composing everything yourself |

### Architecture flow

In a typical application, the runtime works like this:

1. you define one or more service tokens
2. you create classes that extend `BaseService` or `BaseEventService`
3. you register those classes in a service profile
4. a `ServiceManager` activates the profile
5. your UI or other application code resolves services and calls them
6. the scheduler delivers lifecycle events such as `start`, `update`, or `render`

### Why tokens exist

In C# and Unity, it is common to resolve services through interfaces at runtime. TypeScript interfaces are removed when the app is compiled, so the framework uses typed tokens instead.

```ts
import { createServiceToken } from "@realitycollective/service-framework";

export const LOGGER_TOKEN = createServiceToken<LoggerService>("LoggerService");
```

The token is the runtime identity of the service. The type parameter keeps the lookup strongly typed in your editor and during compilation.

## Service design and implementation in a TypeScript application

### Start with a token

Create one token for each service type you want to register:

```ts
import { createServiceToken } from "@realitycollective/service-framework";
import type { WeatherService } from "./weather-service";

export const WEATHER_SERVICE_TOKEN = createServiceToken<WeatherService>("WeatherService");
```

### Create a service class

Most services extend `BaseService<TConfig>`, where `TConfig` describes the configuration object the service expects.

```ts
import { BaseService } from "@realitycollective/service-framework";

export interface LoggerConfig {
  readonly level: "info" | "debug";
}

export class LoggerService extends BaseService<LoggerConfig> {
  public override initialize(): void {
    console.log(`Logger ready at ${this.serviceConfig.level}`);
  }

  public log(message: string): void {
    console.log(`[${this.serviceConfig.level}] ${message}`);
  }
}
```

Important things to notice:

- `serviceName` comes from the registration
- `servicePriority` comes from the registration
- `serviceConfig` is the typed configuration object supplied in the profile
- `manager`, `scheduler`, `environment`, and `abortSignal` are available on the base class

### Understand the lifecycle

The framework gives services a consistent lifecycle regardless of whether the host is plain TypeScript, React, or three.js.

- `initialize()`: prepare the service after registration
- `start()`: begin running once the manager starts
- `reset()`: return to a known state
- `update(context)`: general update loop work
- `lateUpdate(context)`: late update work
- `fixedUpdate(context)`: fixed timestep work
- `render(context)`: render-loop work
- `destroy()`: release resources
- `onFocusChange(context)`: react to app focus changes
- `onPauseChange(context)`: react to pause state changes

If you do not need one of these methods, you can leave it out.

### Register the service in a profile

Services are usually registered through a profile. A profile is just a named list of service registrations.

```ts
import { createServiceProfile } from "@realitycollective/service-framework";
import { LOGGER_TOKEN } from "./tokens";
import { LoggerService } from "./logger-service";

export const profile = createServiceProfile("app", [
  {
    token: LOGGER_TOKEN,
    config: { level: "debug" },
    useClass: LoggerService
  }
]);
```

This says:

- register a service identified by `LOGGER_TOKEN`
- give it the configuration `{ level: "debug" }`
- create it using the `LoggerService` class

### Add dependencies between services

If one service depends on another, declare those dependencies in the registration. The resolved dependency instances are passed to the constructor after the activation context.

```ts
import {
  BaseService,
  type ServiceActivationContext
} from "@realitycollective/service-framework";

export class DashboardService extends BaseService {
  public constructor(
    context: ServiceActivationContext,
    private readonly logger: LoggerService
  ) {
    super(context);
  }

  public override start(): void {
    this.logger.log("Dashboard service started");
  }
}
```

```ts
{
  token: DASHBOARD_TOKEN,
  dependencies: [LOGGER_TOKEN],
  useClass: DashboardService
}
```

Use dependencies when one service truly depends on another service. Do not turn every helper function into a service. Keep simple utility code simple.

### Use modules for child features

Modules are useful when a feature belongs to one parent service instead of existing on its own.

```ts
import { BaseServiceModule } from "@realitycollective/service-framework";

export class AnalyticsModule extends BaseServiceModule<AppService, { readonly sampleRate: number }> {}
```

Use a module when the child logic should automatically follow the parent service lifecycle and should have access to `parentService`.

## Service consumption and use in TypeScript

There are two common ways to consume services:

- plain TypeScript, where you hold the manager yourself
- React, where a provider owns the manager and hooks resolve services

### Plain TypeScript consumption

This is the lowest-level usage pattern and the easiest way to understand what the framework is doing.

```ts
import {
  ServiceManager,
  createServiceProfile
} from "@realitycollective/service-framework";

const manager = new ServiceManager();

manager.initializeProfile(createServiceProfile("app", [
  {
    token: LOGGER_TOKEN,
    config: { level: "info" },
    useClass: LoggerService
  }
]));

manager.start();

const logger = manager.resolve(LOGGER_TOKEN);
logger.log("Application started");
```

This flow is explicit:

1. create a manager
2. initialize a profile
3. start the manager
4. resolve a service and use it

### React consumption

In React, the usual pattern is to wrap the application in `ServiceFrameworkProvider` and then call `useService()` inside components.

```tsx
import React from "react";
import {
  createServiceProfile,
  createServiceToken,
  BaseService
} from "@realitycollective/service-framework";
import {
  ServiceFrameworkProvider,
  useService
} from "@realitycollective/service-framework-react";

const STATUS_TOKEN = createServiceToken<StatusService>("StatusService");

class StatusService extends BaseService {
  public get message(): string {
    return "React service framework ready";
  }
}

function StatusPanel(): React.JSX.Element {
  const service = useService(STATUS_TOKEN);
  return <p>{service.message}</p>;
}

export function App(): React.JSX.Element {
  return (
    <ServiceFrameworkProvider
      profile={createServiceProfile("react-example", [
        {
          token: STATUS_TOKEN,
          useFactory: (context) => new StatusService(context)
        }
      ])}
    >
      <StatusPanel />
    </ServiceFrameworkProvider>
  );
}
```

The provider creates or receives a `ServiceManager`, initializes the supplied profile, and starts the framework by default.

### three.js consumption

If your application uses three.js, you can bridge the host render loop into the framework scheduler.

```ts
import { ThreeRenderLoopBridge } from "@realitycollective/service-framework-three";

const bridge = new ThreeRenderLoopBridge({
  scheduler: manager.scheduler,
  host: renderer
});

bridge.start();
```

Services that implement `render()` will now receive `renderTick` lifecycle calls.

## Advanced use cases

Once the basics are comfortable, these are the most useful next patterns.

### 1. Multiple implementations of the same token

The framework supports registering multiple services under the same token and resolving them by name.

```ts
const services = manager.resolveAll(MULTI_TOKEN);
const namedService = manager.resolve(MULTI_TOKEN, "named-b");
```

Use this when the application needs several implementations of the same contract.

### 2. Capability-based activation

Registrations can be enabled only when the environment supports a capability.

```ts
{
  token: AR_TOKEN,
  requiredCapabilities: ["webxr-ar"],
  useClass: AugmentedRealityService
}
```

This keeps unsupported services out of environments that cannot use them.

### 3. Conditional activation rules

For more complex environment checks, use `enabledWhen`.

```ts
{
  token: SHARE_TOKEN,
  enabledWhen: (environment) => environment.hasCapability("web-share"),
  useClass: ShareService
}
```

### 4. Event-driven services

If a service needs to notify many listeners, `BaseEventService` is often a better fit than manually wiring callbacks through your UI.

```ts
import { BaseEventService } from "@realitycollective/service-framework";

interface WeatherEvents {
  readonly changed: { readonly temperature: number };
}

class WeatherFeedService extends BaseEventService<WeatherEvents> {
  public publishTemperature(temperature: number): void {
    this.emit("changed", { temperature });
  }
}
```

This pattern is especially useful when multiple components or modules need to react to the same state change.

### 5. Service modules for parent-owned behavior

Use `BaseServiceModule<TParent>` when a feature logically belongs to a parent service and should not be registered as an unrelated top-level service.

Examples:

- an analytics module attached to a session service
- a backend adapter module attached to a networking service
- a platform-specific module attached to a client runtime service

### 6. Async startup and late registration

The manager can wait for the framework to initialize or for a service to appear later.

```ts
await manager.waitUntilInitialized();
const weather = await manager.resolveAsync(WEATHER_SERVICE_TOKEN, 2000);
```

This is useful when runtime composition happens in stages.

### 7. Diagnostics and dependency inspection

The framework can report its current state.

```ts
const diagnostics = manager.getDiagnostics();
const graph = manager.getDependencyGraph();
```

Use these when you need to understand registration order, dependency relationships, or whether a service was actually started.

### 8. Timer-based and render-loop scheduling

Use `TimerScheduler` when you want a browser-friendly runtime loop without bringing in a rendering engine.

Use `ThreeRenderLoopBridge` when you want the three.js host render loop to drive `render()`.

### 9. Choosing between the core and the client runtime package

Use the core packages when:

- you want to understand the framework from first principles
- your app only needs a few services
- you want complete control over composition

Use `@realitycollective/service-framework-client` when:

- your app already fits the higher-level client runtime model
- you want a more opinionated starting point for React + three.js clients
- you prefer pre-built state services and runtime composition

## Recommended packaging guidance

- keep framework behavior in the core package
- move only host-specific bindings into integration packages
- keep UI components thin by putting non-visual logic in services
- use event services or snapshot wrappers when the UI needs reactive updates from shared runtime state
- keep examples in the package they demonstrate to reduce onboarding friction

## Next steps

Check out the full end to end walkthrough for creating a weather app with the service framework to orchestrate the backend connectivity

[Walkthrough: Weather service app](./Weather-Client-Walkthrough.md)
