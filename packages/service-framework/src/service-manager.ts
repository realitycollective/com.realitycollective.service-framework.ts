import { BaseService } from "./base-service.js";
import { createEnvironmentDescriptor } from "./environment.js";
import { ManualScheduler } from "./scheduler.js";
import type {
  DependencyGraphNode,
  IEnvironmentDescriptor,
  IService,
  IServiceModule,
  IScheduler,
  PauseChangeContext,
  ServiceActivationContext,
  ServiceDiagnostics,
  ServiceModuleRegistration,
  ServiceProfile,
  ServiceRegistration,
  ServiceSnapshot
} from "./contracts.js";
import type { ServiceToken } from "./tokens.js";

interface ServiceManagerOptions {
  readonly scheduler?: IScheduler;
  readonly environment?: IEnvironmentDescriptor;
}

interface ActiveRecord<TService extends IService = IService> {
  readonly token: ServiceToken<TService>;
  readonly name: string;
  readonly priority: number;
  readonly instance: TService;
  readonly dependencies: readonly ServiceToken<unknown>[];
  readonly modules: ActiveRecord<IServiceModule<TService>>[];
  readonly abortController: AbortController;
  readonly registration: ServiceRegistration<TService>;
  readonly parent: ActiveRecord<IService> | undefined;
}

type Waiter<TService extends IService> = {
  readonly name: string | undefined;
  readonly resolve: (service: TService) => void;
  readonly reject: (error: Error) => void;
  readonly timeoutHandle: ReturnType<typeof setTimeout>;
};

export class ServiceManager {
  private readonly recordsByToken = new Map<symbol, ActiveRecord[]>();
  private readonly schedulerSubscriptions: Array<() => void> = [];
  private readonly waiters = new Map<symbol, Waiter<IService>[]>();
  private profileName = "runtime";
  private initialized = false;
  private started = false;
  private disposed = false;
  private initializationWaiters: Array<{ resolve: () => void; reject: (error: Error) => void; timeoutHandle: ReturnType<typeof setTimeout> }> = [];

  public readonly scheduler: IScheduler;
  public readonly environment: IEnvironmentDescriptor;

  public constructor(options: ServiceManagerOptions = {}) {
    this.scheduler = options.scheduler ?? new ManualScheduler();
    this.environment = options.environment ?? createEnvironmentDescriptor("default");

    this.schedulerSubscriptions.push(
      this.scheduler.subscribe("startup", () => {
        this.start();
      }),
      this.scheduler.subscribe("tick", (context) => {
        this.forEachRecord((record) => {
          record.instance.update(context);
        });
      }),
      this.scheduler.subscribe("lateTick", (context) => {
        this.forEachRecord((record) => {
          record.instance.lateUpdate(context);
        });
      }),
      this.scheduler.subscribe("fixedTick", (context) => {
        this.forEachRecord((record) => {
          record.instance.fixedUpdate(context);
        });
      }),
      this.scheduler.subscribe("renderTick", (context) => {
        this.forEachRecord((record) => {
          record.instance.render(context);
        });
      }),
      this.scheduler.subscribe("focusChange", (context) => {
        this.forEachRecord((record) => {
          record.instance.onFocusChange(context);
        });
      }),
      this.scheduler.subscribe("pauseChange", (context) => {
        this.forEachRecord((record) => {
          record.instance.onPauseChange(context);
        });
      }),
      this.scheduler.subscribe("dispose", () => {
        this.dispose();
      })
    );
  }

  public get isInitialized(): boolean {
    return this.initialized;
  }

  public get isStarted(): boolean {
    return this.started;
  }

  public initializeProfile(profile: ServiceProfile): void {
    this.throwIfDisposed();

    if (this.initialized) {
      throw new Error("ServiceManager has already been initialized.");
    }

    this.profileName = profile.name;
    for (const registration of this.sortRegistrations(profile.services)) {
      const [record] = this.activateRegistrations([registration]);

      if (!record) {
        continue;
      }

      this.walkRecordTree(record, (activeRecord) => {
        this.initializeRecord(activeRecord);
      });
    }

    this.initialized = true;
    this.flushInitializationWaiters();
  }

  public register<TService extends IService>(registration: ServiceRegistration<TService>): TService {
    this.throwIfDisposed();
    const [record] = this.activateRegistrations([registration]);

    if (!record) {
      throw new Error(`Registration "${registration.name ?? registration.token.description}" was filtered out by environment rules.`);
    }

    this.walkRecordTree(record, (activeRecord) => {
      this.initializeRecord(activeRecord);
    });

    if (this.started) {
      this.walkRecordTree(record, (activeRecord) => {
        this.startRecord(activeRecord);
      });
    }

    return record.instance;
  }

  public unregister<TService extends IService>(token: ServiceToken<TService>, name?: string): boolean {
    const record = this.findRecord(token, name);

    if (!record) {
      return false;
    }

    this.disposeRecord(record);
    return true;
  }

  public resolve<TService extends IService>(token: ServiceToken<TService>, name?: string): TService {
    const service = this.tryResolve(token, name);

    if (!service) {
      throw new Error(`Unable to resolve service "${name ?? token.description}".`);
    }

    return service;
  }

  public tryResolve<TService extends IService>(token: ServiceToken<TService>, name?: string): TService | undefined {
    const records = this.recordsByToken.get(token.id) ?? [];
    const match = name
      ? records.find((record) => record.name === name)
      : records[0];

    return match?.instance as TService | undefined;
  }

  public resolveAll<TService extends IService>(token: ServiceToken<TService>): readonly TService[] {
    return (this.recordsByToken.get(token.id) ?? []).map((record) => record.instance as TService);
  }

  public async resolveAsync<TService extends IService>(token: ServiceToken<TService>, timeoutMs = 1000, name?: string): Promise<TService> {
    const existing = this.tryResolve(token, name);

    if (existing) {
      return existing;
    }

    return await new Promise<TService>((resolve, reject) => {
      let waiter: Waiter<TService>;
      const timeoutHandle = setTimeout(() => {
        this.removeWaiter(token.id, waiter as Waiter<IService>);
        reject(new Error(`Timed out waiting for service "${name ?? token.description}".`));
      }, timeoutMs);

      waiter = {
        name,
        resolve,
        reject,
        timeoutHandle
      };

      const bucket = this.waiters.get(token.id) ?? [];
      bucket.push(waiter as Waiter<IService>);
      this.waiters.set(token.id, bucket);
    });
  }

  public async waitUntilInitialized(timeoutMs = 1000): Promise<void> {
    if (this.initialized) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.initializationWaiters = this.initializationWaiters.filter((entry) => entry.timeoutHandle !== timeoutHandle);
        reject(new Error(`Timed out waiting for profile "${this.profileName}" to initialize.`));
      }, timeoutMs);

      this.initializationWaiters.push({
        resolve,
        reject,
        timeoutHandle
      });
    });
  }

  public start(): void {
    if (!this.initialized || this.started) {
      return;
    }

    this.started = true;
    this.forEachRecord((record) => {
      this.startRecord(record);
    });
  }

  public reset(): void {
    this.forEachRecord((record) => {
      record.instance.reset();
    });
  }

  public emitPauseChange(context: PauseChangeContext): void {
    this.scheduler.emit("pauseChange", context);
  }

  public emitFocusChange(focused: boolean): void {
    this.scheduler.emit("focusChange", { focused });
  }

  public getDiagnostics(): ServiceDiagnostics {
    return {
      initialized: this.initialized,
      started: this.started,
      services: this.getAllRecords().map((record) => this.toSnapshot(record))
    };
  }

  public getDependencyGraph(): readonly DependencyGraphNode[] {
    return this.getAllRecords().map((record) => ({
      name: record.name,
      token: record.token.description,
      dependencies: record.dependencies.map((dependency) => dependency.description),
      modules: record.modules.map((module) => module.name)
    }));
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    for (const record of [...this.getAllRecords()].reverse()) {
      this.disposeRecord(record);
    }

    for (const unsubscribe of this.schedulerSubscriptions.splice(0)) {
      unsubscribe();
    }

    this.scheduler.dispose();
  }

  private activateRegistrations<TService extends IService>(
    registrations: readonly ServiceRegistration<TService>[],
    parent?: ActiveRecord<IService>
  ): ActiveRecord<TService>[] {
    const activeRecords: ActiveRecord<TService>[] = [];

    for (const registration of registrations) {
      if (!this.shouldActivate(registration)) {
        continue;
      }

      const record = this.createRecord(registration, parent);
      activeRecords.push(record);
      this.addRecord(record);
      this.notifyWaiters(record);
    }

    for (const record of activeRecords) {
      const modules = this.activateRegistrations(
        this.sortRegistrations(record.registration.modules ?? []),
        record as ActiveRecord<IService>
      );

      for (const moduleRecord of modules) {
        record.modules.push(moduleRecord as ActiveRecord<IServiceModule<TService>>);
      }
    }

    return activeRecords;
  }

  private shouldActivate(registration: ServiceRegistration): boolean {
    if (registration.requiredCapabilities?.some((capability) => !this.environment.hasCapability(capability))) {
      return false;
    }

    return registration.enabledWhen ? registration.enabledWhen(this.environment) : true;
  }

  private sortRegistrations<TService extends IService>(registrations: readonly ServiceRegistration<TService>[]): ServiceRegistration<TService>[] {
    const byToken = new Map(registrations.map((registration) => [registration.token.id, registration]));
    const visited = new Set<ServiceRegistration<TService>>();
    const visiting = new Set<ServiceRegistration<TService>>();

    const visit = (registration: ServiceRegistration<TService>): void => {
      if (visited.has(registration)) {
        return;
      }

      if (visiting.has(registration)) {
        throw new Error(`Circular dependency detected while ordering "${registration.token.description}".`);
      }

      visiting.add(registration);

      for (const dependency of registration.dependencies ?? []) {
        const dependencyRegistration = byToken.get(dependency.id);

        if (dependencyRegistration) {
          visit(dependencyRegistration as ServiceRegistration<TService>);
        }
      }

      visiting.delete(registration);
      visited.add(registration);
    };

    for (const registration of registrations) {
      visit(registration);
    }

    return [...registrations].sort((left, right) => (left.priority ?? 10) - (right.priority ?? 10));
  }

  private createRecord<TService extends IService>(
    registration: ServiceRegistration<TService>,
    parent?: ActiveRecord<IService>
  ): ActiveRecord<TService> {
    const name = registration.name ?? registration.token.description;
    const priority = registration.priority ?? 10;

    if (this.findRecord(registration.token, name)) {
      throw new Error(`A service named "${name}" is already registered for token "${registration.token.description}".`);
    }

    const dependencies = registration.dependencies ?? [];
    const dependencyInstances = dependencies.map((dependency) => this.resolve(dependency as ServiceToken<IService>));
    const abortController = new AbortController();
    const context = {
      name,
      priority,
      config: registration.config,
      manager: this,
      scheduler: this.scheduler,
      environment: this.environment,
      signal: abortController.signal,
      ...(parent ? { parent: parent.instance } : {})
    } as ServiceActivationContext<unknown, IService | undefined>;

    const instance = registration.useClass
      ? new registration.useClass(context, ...dependencyInstances)
      : registration.useFactory
        ? registration.useFactory(context, ...dependencyInstances)
        : (() => {
            throw new Error(`Registration "${name}" is missing a factory or class provider.`);
          })();

    return {
      token: registration.token,
      name,
      priority,
      instance,
      dependencies,
      modules: [],
      abortController,
      registration,
      parent
    };
  }

  private initializeRecord(record: ActiveRecord): void {
    if (record.instance.isInitialized) {
      return;
    }

    record.instance.initialize();
    this.setBaseServiceState(record.instance, "registered", true);
    this.setBaseServiceState(record.instance, "initialized", true);

    for (const module of record.instance.serviceModules) {
      if (!module.isInitialized) {
        module.initialize();
        this.setBaseServiceState(module, "registered", true);
        this.setBaseServiceState(module, "initialized", true);
      }
    }
  }

  private startRecord(record: ActiveRecord): void {
    if (record.instance.isStarted) {
      return;
    }

    record.instance.start();
    this.setBaseServiceState(record.instance, "started", true);

    for (const module of record.instance.serviceModules) {
      if (!module.isStarted) {
        module.start();
        this.setBaseServiceState(module, "started", true);
      }
    }
  }

  private disposeRecord(record: ActiveRecord): void {
    const existing = this.findRecord(record.token, record.name);

    if (!existing || existing !== record) {
      return;
    }

    for (const moduleRecord of [...record.modules].reverse()) {
      this.disposeRecord(moduleRecord);
    }

    record.abortController.abort();
    record.instance.destroy();
    this.setBaseServiceState(record.instance, "destroyed", true);
    this.setBaseServiceState(record.instance, "registered", false);

    if (record.parent?.instance) {
      record.parent.instance.unregisterServiceModule(record.instance as IServiceModule);
    }

    const records = this.recordsByToken.get(record.token.id) ?? [];
    const remaining = records.filter((entry) => entry !== record);

    if (remaining.length === 0) {
      this.recordsByToken.delete(record.token.id);
    } else {
      this.recordsByToken.set(record.token.id, remaining);
    }

    record.modules.length = 0;
  }

  private addRecord(record: ActiveRecord): void {
    const currentRecords = this.recordsByToken.get(record.token.id) ?? [];
    currentRecords.push(record);
    currentRecords.sort((left, right) => left.priority - right.priority);
    this.recordsByToken.set(record.token.id, currentRecords);

    if (record.instance instanceof BaseService) {
      record.instance._setRegistrationState(true);
    }
  }

  private findRecord<TService extends IService>(token: ServiceToken<TService>, name?: string): ActiveRecord<TService> | undefined {
    const records = this.recordsByToken.get(token.id) ?? [];
    const match = name
      ? records.find((record) => record.name === name)
      : records[0];

    return match as ActiveRecord<TService> | undefined;
  }

  private forEachRecord(callback: (record: ActiveRecord) => void): void {
    for (const record of this.getAllRecords()) {
      callback(record);
    }
  }

  private getAllRecords(): ActiveRecord[] {
    return Array.from(this.recordsByToken.values())
      .flat()
      .sort((left, right) => left.priority - right.priority);
  }

  private notifyWaiters(record: ActiveRecord): void {
    const bucket = this.waiters.get(record.token.id);

    if (!bucket) {
      return;
    }

    const matchingWaiters = bucket.filter((waiter) => !waiter.name || waiter.name === record.name);

    for (const waiter of matchingWaiters) {
      clearTimeout(waiter.timeoutHandle);
      waiter.resolve(record.instance);
      this.removeWaiter(record.token.id, waiter);
    }
  }

  private removeWaiter(tokenId: symbol, waiter: Waiter<IService>): void {
    const bucket = this.waiters.get(tokenId) ?? [];
    const remaining = bucket.filter((entry) => entry !== waiter);

    if (remaining.length === 0) {
      this.waiters.delete(tokenId);
    } else {
      this.waiters.set(tokenId, remaining);
    }
  }

  private flushInitializationWaiters(): void {
    for (const waiter of this.initializationWaiters.splice(0)) {
      clearTimeout(waiter.timeoutHandle);
      waiter.resolve();
    }
  }

  private walkRecordTree(record: ActiveRecord, callback: (activeRecord: ActiveRecord) => void): void {
    callback(record);

    for (const moduleRecord of record.modules) {
      this.walkRecordTree(moduleRecord, callback);
    }
  }

  private setBaseServiceState(service: IService, state: "registered" | "initialized" | "started" | "destroyed", value: boolean): void {
    if (!(service instanceof BaseService)) {
      return;
    }

    if (state === "registered") {
      service._setRegistrationState(value);
      return;
    }

    if (state === "initialized") {
      service._setInitializedState(value);
      return;
    }

    if (state === "started") {
      service._setStartedState(value);
      return;
    }

    service._setDestroyedState(value);
  }

  private toSnapshot(record: ActiveRecord): ServiceSnapshot {
    return {
      token: record.token.description,
      name: record.name,
      priority: record.priority,
      moduleNames: record.modules.map((module) => module.name)
    };
  }

  private throwIfDisposed(): void {
    if (this.disposed) {
      throw new Error("ServiceManager has been disposed.");
    }
  }
}
