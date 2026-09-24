/* v8 ignore file */
import type { ServiceManager } from "./service-manager.js";
import type { ServiceToken } from "./tokens.js";
import type { TelemetryLog } from "./telemetry.js";

/**
 * One tick of a scheduler channel. Every binding emits `renderTick` with the
 * same units, so a service reads it the same way on every platform;
 * `renderTickContractCases()` holds each binding to that.
 */
export interface LifecycleContext {
  /** The platform clock, in milliseconds. */
  readonly timestamp: number;
  /** Milliseconds since the previous tick on this channel. */
  readonly deltaTime: number;
  /** The binding's tick count, starting at 1. */
  readonly frame: number;
  /** Which binding emitted it, such as "three", "babylon", "iwsdk", "native", or "timer" for the core's `TimerScheduler`. */
  readonly source: string;
}

export interface FocusChangeContext {
  readonly focused: boolean;
}

export interface PauseChangeContext {
  readonly paused: boolean;
}

export interface SchedulerEventMap {
  readonly startup: undefined;
  readonly tick: LifecycleContext;
  readonly lateTick: LifecycleContext;
  readonly fixedTick: LifecycleContext;
  readonly renderTick: LifecycleContext;
  readonly focusChange: FocusChangeContext;
  readonly pauseChange: PauseChangeContext;
  readonly dispose: undefined;
}

export type SchedulerChannel = keyof SchedulerEventMap;
export type SchedulerHandler<TChannel extends SchedulerChannel> = (payload: SchedulerEventMap[TChannel]) => void;

export interface IScheduler {
  subscribe<TChannel extends SchedulerChannel>(channel: TChannel, handler: SchedulerHandler<TChannel>): () => void;
  emit<TChannel extends SchedulerChannel>(channel: TChannel, payload: SchedulerEventMap[TChannel]): void;
  dispose(): void;
}

export interface IEnvironmentDescriptor {
  readonly name: string;
  readonly capabilities: ReadonlySet<string>;
  hasCapability(capability: string): boolean;
}

export interface ServiceActivationContext<TConfig = unknown, TParent extends IService | undefined = undefined> {
  readonly name: string;
  readonly priority: number;
  readonly config: TConfig;
  readonly manager: ServiceManager;
  readonly scheduler: IScheduler;
  readonly environment: IEnvironmentDescriptor;
  readonly signal: AbortSignal;
  /**
   * The telemetry emitter, always supplied by the manager. Optional here so a
   * context built by hand in a consumer's test still satisfies the type.
   */
  readonly log?: TelemetryLog;
  readonly parent?: TParent;
}

export interface IService {
  readonly serviceName: string;
  readonly servicePriority: number;
  readonly serviceConfig: unknown;
  readonly isEnabled: boolean;
  readonly isInitialized: boolean;
  readonly isStarted: boolean;
  readonly isDestroyed: boolean;
  readonly isServiceRegistered: boolean;
  readonly serviceModules: readonly IServiceModule[];
  initialize(): void;
  start(): void;
  reset(): void;
  update(context: LifecycleContext): void;
  lateUpdate(context: LifecycleContext): void;
  fixedUpdate(context: LifecycleContext): void;
  render(context: LifecycleContext): void;
  destroy(): void;
  onFocusChange(context: FocusChangeContext): void;
  onPauseChange(context: PauseChangeContext): void;
  registerServiceModule(serviceModule: IServiceModule): void;
  unregisterServiceModule(serviceModule: IServiceModule): void;
}

export interface IServiceModule<TParent extends IService = IService> extends IService {
  readonly parentService: TParent;
}

export type EventHandler<TPayload> = (payload: TPayload) => void;

export interface IEventService<TEventMap extends Record<string, unknown>> extends IService {
  on<TEventName extends keyof TEventMap>(eventName: TEventName, handler: EventHandler<TEventMap[TEventName]>): () => void;
  off<TEventName extends keyof TEventMap>(eventName: TEventName, handler: EventHandler<TEventMap[TEventName]>): void;
  once<TEventName extends keyof TEventMap>(eventName: TEventName, handler: EventHandler<TEventMap[TEventName]>): () => void;
  emit<TEventName extends keyof TEventMap>(eventName: TEventName, payload: TEventMap[TEventName]): void;
  listenerCount<TEventName extends keyof TEventMap>(eventName: TEventName): number;
}

export type ServiceClass<TService extends IService, TConfig = unknown, TParent extends IService | undefined = IService | undefined> =
  new (context: ServiceActivationContext<TConfig, TParent>, ...dependencies: readonly unknown[]) => TService;

export type ServiceFactory<TService extends IService, TConfig = unknown, TParent extends IService | undefined = IService | undefined> =
  (context: ServiceActivationContext<TConfig, TParent>, ...dependencies: readonly unknown[]) => TService;

export interface ServiceRegistration<TService extends IService = IService, TConfig = unknown> {
  readonly token: ServiceToken<TService>;
  readonly name?: string;
  readonly priority?: number;
  readonly config?: TConfig;
  readonly dependencies?: readonly ServiceToken<unknown>[];
  readonly modules?: readonly ServiceModuleRegistration<IServiceModule<TService>, TService>[];
  readonly requiredCapabilities?: readonly string[];
  readonly enabledWhen?: (environment: IEnvironmentDescriptor) => boolean;
  readonly useClass?: ServiceClass<TService, TConfig>;
  readonly useFactory?: ServiceFactory<TService, TConfig>;
}

export interface ServiceModuleRegistration<TModule extends IServiceModule<TParent>, TParent extends IService = IService, TConfig = unknown>
  extends Omit<ServiceRegistration<TModule, TConfig>, "modules"> {}

export interface ServiceProfile {
  readonly name: string;
  readonly services: readonly ServiceRegistration[];
}

export interface ServiceSnapshot {
  readonly token: string;
  readonly name: string;
  readonly priority: number;
  readonly moduleNames: readonly string[];
}

export interface ServiceDiagnostics {
  readonly initialized: boolean;
  readonly started: boolean;
  readonly services: readonly ServiceSnapshot[];
}

export interface DependencyGraphNode {
  readonly name: string;
  readonly token: string;
  readonly dependencies: readonly string[];
  readonly modules: readonly string[];
}
