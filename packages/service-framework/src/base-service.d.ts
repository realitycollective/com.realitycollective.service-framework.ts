import type { FocusChangeContext, IEnvironmentDescriptor, IService, IServiceModule, IScheduler, LifecycleContext, ServiceActivationContext } from "./contracts.js";
import type { ServiceManager } from "./service-manager.js";
export declare class BaseService<TConfig = unknown, TParent extends IService | undefined = IService | undefined> implements IService {
    private readonly modules;
    private registered;
    private initialized;
    private started;
    private destroyed;
    readonly manager: ServiceManager;
    readonly scheduler: IScheduler;
    readonly environment: IEnvironmentDescriptor;
    readonly abortSignal: AbortSignal;
    constructor(context: ServiceActivationContext<TConfig, TParent>);
    readonly serviceName: string;
    readonly servicePriority: number;
    readonly serviceConfig: TConfig;
    get isEnabled(): boolean;
    get isInitialized(): boolean;
    get isStarted(): boolean;
    get isDestroyed(): boolean;
    get isServiceRegistered(): boolean;
    get serviceModules(): readonly IServiceModule[];
    initialize(): void;
    start(): void;
    reset(): void;
    update(_context: LifecycleContext): void;
    lateUpdate(_context: LifecycleContext): void;
    fixedUpdate(_context: LifecycleContext): void;
    render(_context: LifecycleContext): void;
    destroy(): void;
    onFocusChange(_context: FocusChangeContext): void;
    onPauseChange(_context: {
        readonly paused: boolean;
    }): void;
    registerServiceModule(serviceModule: IServiceModule): void;
    unregisterServiceModule(serviceModule: IServiceModule): void;
    Initialize(): void;
    Start(): void;
    Reset(): void;
    Update(context: LifecycleContext): void;
    LateUpdate(context: LifecycleContext): void;
    FixedUpdate(context: LifecycleContext): void;
    Render(context: LifecycleContext): void;
    Destroy(): void;
    OnFocusChange(context: FocusChangeContext): void;
    OnPauseChange(context: {
        readonly paused: boolean;
    }): void;
    _setRegistrationState(isRegistered: boolean): void;
    _setInitializedState(isInitialized: boolean): void;
    _setStartedState(isStarted: boolean): void;
    _setDestroyedState(isDestroyed: boolean): void;
}
export declare class BaseServiceModule<TParent extends IService = IService, TConfig = unknown> extends BaseService<TConfig, TParent> implements IServiceModule<TParent> {
    readonly parentService: TParent;
    constructor(context: ServiceActivationContext<TConfig, TParent>);
}
//# sourceMappingURL=base-service.d.ts.map