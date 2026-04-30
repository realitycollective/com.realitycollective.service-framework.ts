import type {
  FocusChangeContext,
  IEnvironmentDescriptor,
  IService,
  IServiceModule,
  IScheduler,
  LifecycleContext,
  ServiceActivationContext
} from "./contracts.js";
import type { ServiceManager } from "./service-manager.js";

export class BaseService<TConfig = unknown, TParent extends IService | undefined = IService | undefined> implements IService {
  private readonly modules: IServiceModule[] = [];
  private registered = false;
  private initialized = false;
  private started = false;
  private destroyed = false;

  public readonly manager: ServiceManager;
  public readonly scheduler: IScheduler;
  public readonly environment: IEnvironmentDescriptor;
  public readonly abortSignal: AbortSignal;

  public constructor(context: ServiceActivationContext<TConfig, TParent>) {
    this.serviceName = context.name;
    this.servicePriority = context.priority;
    this.serviceConfig = context.config;
    this.manager = context.manager;
    this.scheduler = context.scheduler;
    this.environment = context.environment;
    this.abortSignal = context.signal;
  }

  public readonly serviceName: string;
  public readonly servicePriority: number;
  public readonly serviceConfig: TConfig;
  public get isEnabled(): boolean {
    return !this.isDestroyed;
  }

  public get isInitialized(): boolean {
    return this.initialized;
  }

  public get isStarted(): boolean {
    return this.started;
  }

  public get isDestroyed(): boolean {
    return this.destroyed;
  }

  public get isServiceRegistered(): boolean {
    return this.registered;
  }

  public get serviceModules(): readonly IServiceModule[] {
    return this.modules;
  }

  public initialize(): void {}

  public start(): void {}

  public reset(): void {}

  public update(_context: LifecycleContext): void {}

  public lateUpdate(_context: LifecycleContext): void {}

  public fixedUpdate(_context: LifecycleContext): void {}

  public render(_context: LifecycleContext): void {}

  public destroy(): void {}

  public onFocusChange(_context: FocusChangeContext): void {}

  public onPauseChange(_context: { readonly paused: boolean }): void {}

  public registerServiceModule(serviceModule: IServiceModule): void {
    if (!this.modules.includes(serviceModule)) {
      this.modules.push(serviceModule);
    }
  }

  public unregisterServiceModule(serviceModule: IServiceModule): void {
    const moduleIndex = this.modules.indexOf(serviceModule);

    if (moduleIndex >= 0) {
      this.modules.splice(moduleIndex, 1);
    }
  }

  public Initialize(): void {
    this.initialize();
  }

  public Start(): void {
    this.start();
  }

  public Reset(): void {
    this.reset();
  }

  public Update(context: LifecycleContext): void {
    this.update(context);
  }

  public LateUpdate(context: LifecycleContext): void {
    this.lateUpdate(context);
  }

  public FixedUpdate(context: LifecycleContext): void {
    this.fixedUpdate(context);
  }

  public Render(context: LifecycleContext): void {
    this.render(context);
  }

  public Destroy(): void {
    this.destroy();
  }

  public OnFocusChange(context: FocusChangeContext): void {
    this.onFocusChange(context);
  }

  public OnPauseChange(context: { readonly paused: boolean }): void {
    this.onPauseChange(context);
  }

  public _setRegistrationState(isRegistered: boolean): void {
    this.registered = isRegistered;
  }

  public _setInitializedState(isInitialized: boolean): void {
    this.initialized = isInitialized;
  }

  public _setStartedState(isStarted: boolean): void {
    this.started = isStarted;
  }

  public _setDestroyedState(isDestroyed: boolean): void {
    this.destroyed = isDestroyed;
  }
}

export class BaseServiceModule<TParent extends IService = IService, TConfig = unknown> extends BaseService<TConfig, TParent> implements IServiceModule<TParent> {
  public readonly parentService: TParent;

  public constructor(context: ServiceActivationContext<TConfig, TParent>) {
    super(context);

    if (!context.parent) {
      throw new Error(`Service module "${context.name}" requires a parent service.`);
    }

    this.parentService = context.parent;
    this.parentService.registerServiceModule(this);
  }
}
