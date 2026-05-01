import { BaseEventService, BaseServiceModule, type LifecycleContext } from "@realitycollective/service-framework";
import type { BackendAdapterKind, BackendAdapterServiceConfig, BackendAdapterStateSnapshot, BackendConversationRequest, BackendConversationResponse, CapabilitySnapshot, ConnectionState, ContentContextSnapshot, ConversationMessage, ConversationServiceConfig, ConversationSnapshot, ExperienceStateConfig, ExperienceStateSnapshot, MockBackendAdapterConfig, RenderStateSnapshot, RestBackendAdapterConfig, SessionServiceConfig, SessionSnapshot } from "./contracts.js";
export declare class CapabilityService extends BaseEventService<{
    changed: CapabilitySnapshot;
}> {
    private snapshot;
    initialize(): void;
    getSnapshot(): CapabilitySnapshot;
    hasCapability(capability: string): boolean;
}
export declare class ExperienceStateService extends BaseEventService<{
    changed: ExperienceStateSnapshot;
}, ExperienceStateConfig> {
    private snapshot;
    initialize(): void;
    getSnapshot(): ExperienceStateSnapshot;
    setMode(mode: ExperienceStateSnapshot["mode"]): void;
    openWidget(): void;
    minimizeWidget(): void;
    closeWidget(): void;
    setConnectionState(connectionState: ConnectionState, lastError?: string): void;
}
export declare class SessionService extends BaseEventService<{
    changed: SessionSnapshot;
}, SessionServiceConfig> {
    private snapshot;
    initialize(): void;
    getSnapshot(): SessionSnapshot;
    touch(): void;
}
export declare class ContentContextService extends BaseEventService<{
    changed: ContentContextSnapshot;
}, ContentContextSnapshot> {
    private snapshot;
    initialize(): void;
    getSnapshot(): ContentContextSnapshot;
    mergeContext(context: Partial<ContentContextSnapshot>): void;
    setGeolocation(latitude: number, longitude: number): void;
}
export declare abstract class BaseBackendAdapterModule<TConfig> extends BaseServiceModule<BackendAdapterService, TConfig> {
    abstract readonly adapterKind: BackendAdapterKind;
    abstract send(request: BackendConversationRequest): Promise<BackendConversationResponse>;
}
export declare class MockBackendAdapterModule extends BaseBackendAdapterModule<MockBackendAdapterConfig> {
    readonly adapterKind: "mock";
    send(request: BackendConversationRequest): Promise<BackendConversationResponse>;
}
export declare class RestBackendAdapterModule extends BaseBackendAdapterModule<RestBackendAdapterConfig> {
    readonly adapterKind: "rest";
    send(request: BackendConversationRequest): Promise<BackendConversationResponse>;
}
export declare class BackendAdapterService extends BaseEventService<{
    changed: BackendAdapterStateSnapshot;
}, BackendAdapterServiceConfig> {
    private snapshot;
    initialize(): void;
    getSnapshot(): BackendAdapterStateSnapshot;
    setPreferredAdapter(preferredAdapter: BackendAdapterKind): void;
    sendMessage(request: BackendConversationRequest): Promise<BackendConversationResponse>;
    private resolveModule;
}
export declare class ConversationService extends BaseEventService<{
    changed: ConversationSnapshot;
}, ConversationServiceConfig> {
    private readonly sessionService;
    private readonly backendAdapterService;
    private readonly contentContextService;
    private readonly experienceStateService;
    private snapshot;
    private sequence;
    constructor(context: ConstructorParameters<typeof BaseEventService<{
        changed: ConversationSnapshot;
    }, ConversationServiceConfig>>[0], sessionService: SessionService, backendAdapterService: BackendAdapterService, contentContextService: ContentContextService, experienceStateService: ExperienceStateService);
    initialize(): void;
    getSnapshot(): ConversationSnapshot;
    sendUserMessage(message: string): Promise<ConversationMessage>;
    private createMessage;
}
export declare class RenderStateService extends BaseEventService<{
    changed: RenderStateSnapshot;
}> {
    private snapshot;
    getSnapshot(): RenderStateSnapshot;
    render(context: LifecycleContext): void;
}
//# sourceMappingURL=services.d.ts.map