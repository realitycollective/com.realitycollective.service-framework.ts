import type { DependencyGraphNode, IEnvironmentDescriptor, IService, IScheduler, PauseChangeContext, ServiceDiagnostics, ServiceProfile, ServiceRegistration } from "./contracts.js";
import type { ServiceToken } from "./tokens.js";
interface ServiceManagerOptions {
    readonly scheduler?: IScheduler;
    readonly environment?: IEnvironmentDescriptor;
}
export declare class ServiceManager {
    private readonly recordsByToken;
    private readonly schedulerSubscriptions;
    private readonly waiters;
    private profileName;
    private initialized;
    private started;
    private disposed;
    private initializationWaiters;
    readonly scheduler: IScheduler;
    readonly environment: IEnvironmentDescriptor;
    constructor(options?: ServiceManagerOptions);
    get isInitialized(): boolean;
    get isStarted(): boolean;
    initializeProfile(profile: ServiceProfile): void;
    register<TService extends IService>(registration: ServiceRegistration<TService>): TService;
    unregister<TService extends IService>(token: ServiceToken<TService>, name?: string): boolean;
    resolve<TService extends IService>(token: ServiceToken<TService>, name?: string): TService;
    tryResolve<TService extends IService>(token: ServiceToken<TService>, name?: string): TService | undefined;
    resolveAll<TService extends IService>(token: ServiceToken<TService>): readonly TService[];
    resolveAsync<TService extends IService>(token: ServiceToken<TService>, timeoutMs?: number, name?: string): Promise<TService>;
    waitUntilInitialized(timeoutMs?: number): Promise<void>;
    start(): void;
    reset(): void;
    emitPauseChange(context: PauseChangeContext): void;
    emitFocusChange(focused: boolean): void;
    getDiagnostics(): ServiceDiagnostics;
    getDependencyGraph(): readonly DependencyGraphNode[];
    dispose(): void;
    private activateRegistrations;
    private shouldActivate;
    private sortRegistrations;
    private createRecord;
    private initializeRecord;
    private startRecord;
    private disposeRecord;
    private addRecord;
    private findRecord;
    private forEachRecord;
    private getAllRecords;
    private notifyWaiters;
    private removeWaiter;
    private flushInitializationWaiters;
    private walkRecordTree;
    private setBaseServiceState;
    private toSnapshot;
    private throwIfDisposed;
}
export {};
//# sourceMappingURL=service-manager.d.ts.map