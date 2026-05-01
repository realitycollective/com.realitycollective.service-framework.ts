import type { ReactNode } from "react";
import type { IEnvironmentDescriptor, IEventService, IScheduler, LifecycleContext, ServiceProfile } from "@realitycollective/service-framework";
export type ClientMode = "chat-only" | "avatar" | "xr";
export type WidgetState = "closed" | "open" | "minimized";
export type ConnectionState = "idle" | "sending" | "ready" | "error";
export type BackendAdapterKind = "mock" | "rest";
export type ConversationRole = "assistant" | "system" | "user";
export interface CapabilitySnapshot {
    readonly environmentName: string;
    readonly capabilities: readonly string[];
}
export interface ExperienceStateSnapshot {
    readonly mode: ClientMode;
    readonly widgetState: WidgetState;
    readonly connectionState: ConnectionState;
    readonly lastError?: string;
}
export interface SessionSnapshot {
    readonly sessionId: string;
    readonly createdAt: number;
    readonly lastActivityAt: number;
}
export interface GeolocationSnapshot {
    readonly latitude: number;
    readonly longitude: number;
}
export interface ContentContextSnapshot {
    readonly page?: string;
    readonly campaign?: string;
    readonly geolocation?: GeolocationSnapshot;
}
export interface ConversationMessage {
    readonly id: string;
    readonly role: ConversationRole;
    readonly content: string;
    readonly timestamp: number;
}
export interface ConversationSnapshot {
    readonly messages: readonly ConversationMessage[];
    readonly status: ConnectionState;
    readonly lastError?: string;
}
export interface BackendAdapterStateSnapshot {
    readonly preferredAdapter: BackendAdapterKind;
    readonly activeAdapter?: BackendAdapterKind;
    readonly state: ConnectionState;
    readonly lastError?: string;
}
export interface BackendConversationRequest {
    readonly sessionId: string;
    readonly message: string;
    readonly context: ContentContextSnapshot;
}
export interface BackendConversationResponse {
    readonly adapter: BackendAdapterKind;
    readonly content: string;
    readonly timestamp: number;
}
export interface RenderStateSnapshot extends LifecycleContext {
}
export interface SessionServiceConfig {
    readonly sessionId?: string;
    readonly now?: () => number;
}
export interface ExperienceStateConfig {
    readonly initialMode?: ClientMode;
    readonly initialWidgetState?: WidgetState;
}
export interface ConversationServiceConfig {
    readonly welcomeMessage?: string;
    readonly now?: () => number;
}
export interface MockBackendAdapterConfig {
    readonly replyPrefix?: string;
    readonly now?: () => number;
}
export interface ResponseLike {
    readonly ok: boolean;
    readonly status: number;
    json(): Promise<unknown>;
}
export type FetchLike = (input: string, init?: {
    readonly method?: string;
    readonly headers?: Record<string, string>;
    readonly body?: string;
}) => Promise<ResponseLike>;
export interface RestBackendAdapterConfig {
    readonly endpoint?: string;
    readonly fetchFn?: FetchLike;
    readonly headers?: Record<string, string>;
    readonly now?: () => number;
}
export interface BackendAdapterServiceConfig {
    readonly preferredAdapter?: BackendAdapterKind;
}
export interface BaseFrameworkClientProfileOptions {
    readonly profileName?: string;
    readonly session?: SessionServiceConfig;
    readonly experience?: ExperienceStateConfig;
    readonly conversation?: ConversationServiceConfig;
    readonly context?: ContentContextSnapshot;
    readonly backend?: {
        readonly preferredAdapter?: BackendAdapterKind;
        readonly includeMockAdapter?: boolean;
        readonly mock?: MockBackendAdapterConfig;
        readonly rest?: RestBackendAdapterConfig;
    };
}
export interface BaseFrameworkClientEnvironmentOptions {
    readonly name?: string;
    readonly includeBrowserDefaults?: boolean;
    readonly capabilities?: readonly string[];
}
export interface BaseFrameworkClientRuntimeOptions {
    readonly autoStart?: boolean;
    readonly environment?: IEnvironmentDescriptor;
    readonly environmentOptions?: BaseFrameworkClientEnvironmentOptions;
    readonly profile?: ServiceProfile;
    readonly profileOptions?: BaseFrameworkClientProfileOptions;
    readonly scheduler?: IScheduler;
}
export interface BaseFrameworkClientProviderProps {
    readonly children?: ReactNode;
    readonly runtime?: BaseFrameworkClientRuntimeLike;
    readonly runtimeOptions?: BaseFrameworkClientRuntimeOptions;
}
export interface ChangeAwareService<TSnapshot> extends IEventService<{
    changed: TSnapshot;
}> {
    getSnapshot(): TSnapshot;
}
export interface AnimationLoopHostLike {
    setAnimationLoop(callback: ((timestamp: number) => void) | null): void;
}
export interface BaseFrameworkClientRuntimeLike {
    readonly environment: IEnvironmentDescriptor;
    readonly profile: ServiceProfile;
    readonly scheduler: IScheduler;
    readonly manager: import("@realitycollective/service-framework").ServiceManager;
    bindRenderLoop(host: AnimationLoopHostLike): import("@realitycollective/service-framework-three").ThreeRenderLoopBridge;
    dispose(): void;
}
//# sourceMappingURL=contracts.d.ts.map