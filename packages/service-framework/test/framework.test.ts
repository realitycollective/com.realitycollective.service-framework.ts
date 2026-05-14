import {
  BaseService,
  BaseServiceModule,
  ServiceManager,
  createEnvironmentDescriptor,
  createServiceProfile,
  createServiceToken,
  type FocusChangeContext,
  type IService,
  type LifecycleContext,
  type PauseChangeContext
} from "../src/index.js";

const LOGGER_TOKEN = createServiceToken<LoggerService>("LoggerService");
const COUNTER_TOKEN = createServiceToken<CounterService>("CounterService");
const MODULE_TOKEN = createServiceToken<CounterModule>("CounterModule");
const MULTI_TOKEN = createServiceToken<NamedService>("NamedService");
const MANUAL_TOKEN = createServiceToken<IService>("ManualService");

class LoggerService extends BaseService<{ readonly label: string }> {
  public readonly lifecycle: string[] = [];

  public override initialize(): void {
    this.lifecycle.push(`initialize:${this.serviceName}:${this.serviceConfig.label}`);
  }

  public override start(): void {
    this.lifecycle.push(`start:${this.serviceName}`);
  }

  public override reset(): void {
    this.lifecycle.push(`reset:${this.serviceName}`);
  }

  public override update(context: LifecycleContext): void {
    this.lifecycle.push(`update:${context.source}:${context.frame}`);
  }

  public override lateUpdate(context: LifecycleContext): void {
    this.lifecycle.push(`late:${context.source}:${context.frame}`);
  }

  public override fixedUpdate(context: LifecycleContext): void {
    this.lifecycle.push(`fixed:${context.source}:${context.frame}`);
  }

  public override render(context: LifecycleContext): void {
    this.lifecycle.push(`render:${context.source}:${context.frame}`);
  }

  public override onFocusChange(context: FocusChangeContext): void {
    this.lifecycle.push(`focus:${context.focused}`);
  }

  public override onPauseChange(context: PauseChangeContext): void {
    this.lifecycle.push(`pause:${context.paused}`);
  }

  public override destroy(): void {
    this.lifecycle.push(`destroy:${this.serviceName}`);
  }
}

class CounterService extends BaseService<{ readonly seed: number }> {
  public constructor(
    context: ConstructorParameters<typeof BaseService<{ readonly seed: number }>>[0],
    public readonly logger: LoggerService
  ) {
    super(context);
  }

  public count = 0;

  public override initialize(): void {
    this.count = this.serviceConfig.seed;
    this.logger.lifecycle.push(`counter:init:${this.count}`);
  }

  public override update(context: LifecycleContext): void {
    this.count += 1;
    this.logger.lifecycle.push(`counter:update:${context.frame}:${this.count}`);
  }

  public override destroy(): void {
    this.logger.lifecycle.push(`counter:destroy:${this.count}`);
  }
}

class CounterModule extends BaseServiceModule<CounterService, { readonly increment: number }> {
  public constructor(
    context: ConstructorParameters<typeof BaseServiceModule<CounterService, { readonly increment: number }>>[0],
    public readonly logger: LoggerService
  ) {
    super(context);
  }

  public override initialize(): void {
    this.parentService.count += this.serviceConfig.increment;
    this.logger.lifecycle.push(`module:init:${this.parentService.count}`);
  }

  public override update(context: LifecycleContext): void {
    this.parentService.count += this.serviceConfig.increment;
    this.logger.lifecycle.push(`module:update:${context.frame}:${this.parentService.count}`);
  }

  public override destroy(): void {
    this.logger.lifecycle.push(`module:destroy:${this.parentService.count}`);
  }
}

class NamedService extends BaseService {
  public constructor(
    context: ConstructorParameters<typeof BaseService>[0],
    public readonly logger: LoggerService
  ) {
    super(context);
  }

  public override initialize(): void {
    this.logger.lifecycle.push(`named:init:${this.serviceName}`);
  }
}

class ManualLifecycleService implements IService {
  public readonly serviceModules: readonly [] = [];
  public isInitialized = false;
  public isStarted = false;
  public isDestroyed = false;
  public isServiceRegistered = false;
  public readonly isEnabled = true;

  public constructor(
    public readonly serviceName: string,
    public readonly servicePriority: number,
    public readonly serviceConfig: unknown
  ) {}

  public initialize(): void {
    this.isInitialized = true;
  }

  public start(): void {
    this.isStarted = true;
  }

  public reset(): void {}

  public update(): void {}

  public lateUpdate(): void {}

  public fixedUpdate(): void {}

  public render(): void {}

  public destroy(): void {
    this.isDestroyed = true;
  }

  public onFocusChange(): void {}

  public onPauseChange(): void {}

  public registerServiceModule(): void {}

  public unregisterServiceModule(): void {}
}

function createFrame(source: string, frame: number): LifecycleContext {
  return {
    timestamp: frame * 16,
    deltaTime: 16,
    frame,
    source
  };
}

describe("service framework core", () => {
  it("creates environment descriptors and service profiles", () => {
    const environment = createEnvironmentDescriptor("browser", ["dom", "render-loop"]);
    const profile = createServiceProfile("sample", []);
    const manager = new ServiceManager();
    const startupManager = new ServiceManager();

    expect(environment.hasCapability("dom")).toBe(true);
    expect(environment.hasCapability("native")).toBe(false);
    expect(manager.isInitialized).toBe(false);
    expect(manager.isStarted).toBe(false);
    expect(profile).toEqual({
      name: "sample",
      services: []
    });

    startupManager.initializeProfile(createServiceProfile("startup", [
      {
        token: createServiceToken<BaseService>("startup-service"),
        useFactory: (context) => new BaseService(context)
      }
    ]));
    startupManager.scheduler.emit("startup", undefined);
    expect(startupManager.isStarted).toBe(true);
  });

  it("supports class-based registrations", () => {
    const manager = new ServiceManager();

    manager.initializeProfile(createServiceProfile("use-class", [
      {
        token: LOGGER_TOKEN,
        name: "class-logger",
        config: { label: "class" },
        useClass: LoggerService
      }
    ]));

    expect(manager.resolve(LOGGER_TOKEN, "class-logger").serviceName).toBe("class-logger");
  });

  it("initializes, starts, updates, resets and unregisters services and modules", async () => {
    const environment = createEnvironmentDescriptor("browser", ["dom"]);
    const manager = new ServiceManager({ environment });
    const initializing = manager.waitUntilInitialized(250);

    manager.start();

    const profile = createServiceProfile("main", [
      {
        token: LOGGER_TOKEN,
        name: "logger",
        priority: 1,
        config: { label: "primary" },
        useFactory: (context) => new LoggerService(context as ConstructorParameters<typeof LoggerService>[0])
      },
      {
        token: COUNTER_TOKEN,
        name: "counter",
        priority: 5,
        config: { seed: 2 },
        dependencies: [LOGGER_TOKEN],
        modules: [
          {
            token: MODULE_TOKEN,
            name: "counter-module",
            priority: 6,
            config: { increment: 3 },
            dependencies: [LOGGER_TOKEN],
            useFactory: (context, logger) => new CounterModule(context as ConstructorParameters<typeof CounterModule>[0], logger as LoggerService)
          }
        ],
        useFactory: (context, logger) => new CounterService(context as ConstructorParameters<typeof CounterService>[0], logger as LoggerService)
      },
      {
        token: MULTI_TOKEN,
        name: "named-a",
        priority: 7,
        dependencies: [LOGGER_TOKEN],
        useFactory: (context, logger) => new NamedService(context as ConstructorParameters<typeof NamedService>[0], logger as LoggerService)
      },
      {
        token: MULTI_TOKEN,
        name: "named-b",
        priority: 8,
        dependencies: [LOGGER_TOKEN],
        useFactory: (context, logger) => new NamedService(context as ConstructorParameters<typeof NamedService>[0], logger as LoggerService)
      },
      {
        token: MANUAL_TOKEN,
        name: "manual",
        priority: 9,
        useFactory: (context) => new ManualLifecycleService(context.name, context.priority, context.config)
      },
      {
        token: createServiceToken<BaseService>("dom-only"),
        requiredCapabilities: ["dom"],
        useFactory: (context) => new BaseService(context)
      }
    ]);
    manager.initializeProfile(profile);
    await expect(initializing).resolves.toBeUndefined();

    await expect(manager.waitUntilInitialized()).resolves.toBeUndefined();

    const logger = manager.resolve(LOGGER_TOKEN);
    const counter = manager.resolve(COUNTER_TOKEN);
    const manual = manager.resolve(MANUAL_TOKEN) as ManualLifecycleService;
    expect(logger.isInitialized).toBe(true);
    expect(counter.isInitialized).toBe(true);
    expect(counter.serviceModules).toHaveLength(1);
    expect(manager.tryResolve(MODULE_TOKEN)).toBeDefined();
    expect(logger.lifecycle).toContain("module:init:5");
    expect(counter.count).toBe(5);
    expect(manager.resolveAll(MULTI_TOKEN).map((service) => service.serviceName)).toEqual(["named-a", "named-b"]);
    expect(manager.resolve(MULTI_TOKEN, "named-b").serviceName).toBe("named-b");
    expect(manager.tryResolve(createServiceToken<BaseService>("missing"))).toBeUndefined();
    expect(() => manager.resolve(createServiceToken<BaseService>("missing"))).toThrow('Unable to resolve service "missing".');

    manager.start();
    manager.start();

    logger.Update(createFrame("manual", 1));
    logger.LateUpdate(createFrame("manual", 2));
    logger.FixedUpdate(createFrame("manual", 3));
    logger.Render(createFrame("manual", 4));
    logger.OnFocusChange({ focused: false });
    logger.OnPauseChange({ paused: true });
    logger.Reset();

    manager.scheduler.emit("tick", createFrame("tick", 10));
    manager.scheduler.emit("lateTick", createFrame("late", 11));
    manager.scheduler.emit("fixedTick", createFrame("fixed", 12));
    manager.scheduler.emit("renderTick", createFrame("render", 13));
    manager.emitFocusChange(true);
    manager.emitPauseChange({ paused: false });
    manager.reset();

    expect(logger.lifecycle).toContain("initialize:logger:primary");
    expect(logger.lifecycle).toContain("counter:init:2");
    expect(logger.lifecycle).toContain("module:init:5");
    expect(logger.lifecycle).toContain("named:init:named-a");
    expect(logger.lifecycle).toContain("named:init:named-b");
    expect(logger.lifecycle).toContain("start:logger");
    expect(logger.lifecycle).toContain("counter:update:10:6");
    expect(logger.lifecycle).toContain("module:update:10:9");
    expect(logger.lifecycle).toContain("late:late:11");
    expect(logger.lifecycle).toContain("fixed:fixed:12");
    expect(logger.lifecycle).toContain("render:render:13");
    expect(logger.lifecycle).toContain("focus:true");
    expect(logger.lifecycle).toContain("pause:false");
    expect(logger.lifecycle).toContain("reset:logger");

    expect(manual.isInitialized).toBe(true);
    expect(manual.isStarted).toBe(true);

    const diagnostics = manager.getDiagnostics();
    const graph = manager.getDependencyGraph();

    expect(diagnostics.initialized).toBe(true);
    expect(diagnostics.started).toBe(true);
    expect(diagnostics.services.find((service) => service.name === "counter")?.moduleNames).toEqual(["counter-module"]);
    expect(graph.find((node) => node.name === "counter")?.dependencies).toEqual(["LoggerService"]);
    expect(graph.find((node) => node.name === "counter")?.modules).toEqual(["counter-module"]);

    expect(manager.unregister(LOGGER_TOKEN, "missing")).toBe(false);
    expect(manager.unregister(COUNTER_TOKEN, "counter")).toBe(true);
    expect(counter.isDestroyed).toBe(true);
    expect(counter.isServiceRegistered).toBe(false);
    expect(counter.serviceModules).toHaveLength(0);
    expect(logger.lifecycle).toContain("module:destroy:9");
    expect(logger.lifecycle).toContain("counter:destroy:9");
  });

  it("supports async resolution, duplicate detection and environment filtering", async () => {
    const manager = new ServiceManager();
    manager.initializeProfile(createServiceProfile("runtime", []));
    manager.start();
    const asyncToken = createServiceToken<NamedService>("async");
    const waiterOne = manager.resolveAsync(asyncToken, 250, "one");
    const waiterTwo = manager.resolveAsync(asyncToken, 250, "two");

    const logger = manager.register({
      token: LOGGER_TOKEN,
      name: "runtime-logger",
      config: { label: "runtime" },
      useFactory: (context) => new LoggerService(context as ConstructorParameters<typeof LoggerService>[0])
    });

    setTimeout(() => {
      manager.register({
        token: asyncToken,
        name: "one",
        dependencies: [LOGGER_TOKEN],
        useFactory: (context, resolvedLogger) => new NamedService(context as ConstructorParameters<typeof NamedService>[0], resolvedLogger as LoggerService)
      });
    }, 0);

    setTimeout(() => {
      manager.register({
        token: asyncToken,
        name: "two",
        dependencies: [LOGGER_TOKEN],
        useFactory: (context, resolvedLogger) => new NamedService(context as ConstructorParameters<typeof NamedService>[0], resolvedLogger as LoggerService)
      });
    }, 10);

    await expect(waiterOne).resolves.toHaveProperty("serviceName", "one");
    await expect(waiterTwo).resolves.toHaveProperty("serviceName", "two");
    await expect(manager.resolveAsync(LOGGER_TOKEN)).resolves.toBe(logger);
    await expect(manager.resolveAsync(createServiceToken<BaseService>("never"), 20)).rejects.toThrow('Timed out waiting for service "never".');
    expect(manager.resolve(asyncToken, "one").isStarted).toBe(true);
    expect(manager.unregister(asyncToken, "one")).toBe(true);
    expect(manager.resolveAll(asyncToken).map((service) => service.serviceName)).toEqual(["two"]);
    expect(manager.unregister(asyncToken)).toBe(true);
    expect(() => (manager as unknown as { disposeRecord: (record: unknown) => void }).disposeRecord({ token: asyncToken, name: "ghost" })).not.toThrow();

    expect(() => manager.register({
      token: LOGGER_TOKEN,
      name: "runtime-logger",
      config: { label: "runtime" },
      useFactory: (context) => new LoggerService(context as ConstructorParameters<typeof LoggerService>[0])
    })).toThrow('A service named "runtime-logger" is already registered for token "LoggerService".');

    expect(() => manager.register({
      token: createServiceToken<BaseService>("filtered"),
      requiredCapabilities: ["dom"],
      useFactory: (context) => new BaseService(context)
    })).toThrow('Registration "filtered" was filtered out by environment rules.');

    expect(logger.serviceName).toBe("runtime-logger");
  });

  it("rejects invalid initialization paths and supports disposal via scheduler", async () => {
    const schedulerManager = new ServiceManager();
    await expect(schedulerManager.waitUntilInitialized(10)).rejects.toThrow('Timed out waiting for profile "runtime" to initialize.');

    const circularA = createServiceToken<BaseService>("circular-a");
    const circularB = createServiceToken<BaseService>("circular-b");

    expect(() => schedulerManager.initializeProfile(createServiceProfile("circular", [
      {
        token: circularA,
        dependencies: [circularB],
        useFactory: (context) => new BaseService(context)
      },
      {
        token: circularB,
        dependencies: [circularA],
        useFactory: (context) => new BaseService(context)
      }
    ]))).toThrow('Circular dependency detected while ordering "circular-a".');

    expect(() => schedulerManager.register({
      token: createServiceToken<BaseService>("invalid")
    } as never)).toThrow('Registration "invalid" is missing a factory or class provider.');

    const filteredManager = new ServiceManager();
    filteredManager.initializeProfile(createServiceProfile("filtered", [
      {
        token: createServiceToken<BaseService>("dom-profile"),
        requiredCapabilities: ["dom"],
        useFactory: (context) => new BaseService(context)
      }
    ]));
    expect(filteredManager.getDiagnostics().services).toEqual([]);
    expect(() => filteredManager.initializeProfile(createServiceProfile("again", []))).toThrow("ServiceManager has already been initialized.");

    const scheduler = new (await import("../src/scheduler.js")).ManualScheduler();
    const manager = new ServiceManager({ scheduler });

    manager.initializeProfile(createServiceProfile("dispose", [
      {
        token: LOGGER_TOKEN,
        name: "scheduler-logger",
        config: { label: "scheduler" },
        useFactory: (context) => new LoggerService(context as ConstructorParameters<typeof LoggerService>[0])
      }
    ]));

    scheduler.dispose();

    expect(() => manager.register({
      token: createServiceToken<BaseService>("after-dispose"),
      useFactory: (context) => new BaseService(context)
    })).toThrow("ServiceManager has been disposed.");

    manager.dispose();
  });

  it("covers defensive fallback paths for empty lookups and internal cleanup", () => {
    const manager = new ServiceManager();
    const missingToken = createServiceToken<BaseService>("missing-list");

    expect(manager.resolveAll(missingToken)).toEqual([]);

    const profile = createServiceProfile("enabled-when", [
      {
        token: createServiceToken<BaseService>("enabled-when-service"),
        enabledWhen: () => true,
        useFactory: (context) => new BaseService(context)
      },
      {
        token: createServiceToken<BaseService>("disabled-when-service"),
        enabledWhen: () => false,
        useFactory: (context) => new BaseService(context)
      },
      {
        token: createServiceToken<IService>("default-priority"),
        useFactory: (context) => new LoggerService({ ...context, config: { label: "default" } })
      }
    ]);

    const sortRegistrations = (manager as unknown as {
      sortRegistrations: (services: typeof profile.services) => typeof profile.services;
    }).sortRegistrations;

    expect(sortRegistrations(profile.services).map((service) => service.name ?? service.token.description)).toEqual([
      "enabled-when-service",
      "disabled-when-service",
      "default-priority"
    ]);

    manager.initializeProfile(profile);
    expect(manager.getDiagnostics().services.map((service) => service.name)).toEqual([
      "enabled-when-service",
      "default-priority"
    ]);

    const internalManager = manager as unknown as {
      removeWaiter: (tokenId: symbol, waiter: unknown) => void;
      disposeRecord: (record: {
        token: ReturnType<typeof createServiceToken<BaseService>>;
        name: string;
        modules: never[];
        abortController: AbortController;
        instance: BaseService;
        parent: undefined;
      }) => void;
      findRecord: (token: ReturnType<typeof createServiceToken<BaseService>>, name: string) => unknown;
    };

    // service-manager.ts:424,441 - module already initialized/started when initializeRecord/startRecord re-runs
    const doubleInitManager = new ServiceManager();
    const parentSvcToken = createServiceToken<BaseService>("double-init-parent");
    const parentModuleToken = createServiceToken<BaseService>("double-init-module");

    doubleInitManager.initializeProfile(createServiceProfile("double-init", [
      {
        token: parentSvcToken,
        name: "double-init-parent",
        modules: [
          {
            token: parentModuleToken,
            name: "double-init-module",
            useFactory: (context) => new BaseServiceModule(context as ConstructorParameters<typeof BaseServiceModule>[0])
          }
        ],
        useFactory: (context) => new BaseService(context as ConstructorParameters<typeof BaseService>[0])
      }
    ]));

    const doubleInitInternal = doubleInitManager as unknown as {
      initializeRecord: (record: unknown) => void;
      startRecord: (record: unknown) => void;
      findRecord: (token: ReturnType<typeof createServiceToken<BaseService>>, name: string) => unknown;
    };
    const parentRecord = doubleInitInternal.findRecord(parentSvcToken, "double-init-parent");
    const parentSvc = doubleInitManager.resolve(parentSvcToken, "double-init-parent");
    parentSvc._setInitializedState(false);
    doubleInitInternal.initializeRecord(parentRecord);

    doubleInitManager.start();
    parentSvc._setStartedState(false);
    doubleInitInternal.startRecord(parentRecord);

    // service-manager.ts:145 - register() called before manager.start()
    const preStartManager = new ServiceManager();
    preStartManager.initializeProfile(createServiceProfile("pre-start", []));
    const preStartToken = createServiceToken<BaseService>("pre-start-svc");
    const preStartSvc = preStartManager.register({
      token: preStartToken,
      useFactory: (context) => new BaseService(context)
    });
    expect(preStartSvc.isInitialized).toBe(true);
    expect(preStartSvc.isStarted).toBe(false);

    internalManager.removeWaiter(Symbol("missing"), {});

    const fakeToken = createServiceToken<BaseService>("fake-dispose");
    const fakeRecord = {
      token: fakeToken,
      name: "fake-dispose",
      modules: [],
      abortController: new AbortController(),
      instance: new BaseService({
        name: "fake-dispose",
        priority: 1,
        config: {},
        manager,
        scheduler: manager.scheduler,
        environment: createEnvironmentDescriptor("default"),
        signal: new AbortController().signal
      }),
      parent: undefined
    };

    internalManager.findRecord = () => fakeRecord;
    expect(() => internalManager.disposeRecord(fakeRecord)).not.toThrow();
  });
});
