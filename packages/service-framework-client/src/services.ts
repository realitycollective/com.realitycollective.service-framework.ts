import {
  BaseEventService,
  BaseServiceModule,
  type LifecycleContext
} from "@realitycollective/service-framework";
import type {
  BackendAdapterKind,
  BackendAdapterServiceConfig,
  BackendAdapterStateSnapshot,
  BackendConversationRequest,
  BackendConversationResponse,
  CapabilitySnapshot,
  ConnectionState,
  ContentContextSnapshot,
  ConversationMessage,
  ConversationServiceConfig,
  ConversationSnapshot,
  ExperienceStateConfig,
  ExperienceStateSnapshot,
  MockBackendAdapterConfig,
  RenderStateSnapshot,
  RestBackendAdapterConfig,
  SessionServiceConfig,
  SessionSnapshot
} from "./contracts.js";

function getNow(now?: () => number): number {
  return (now ?? Date.now)();
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class CapabilityService extends BaseEventService<{ changed: CapabilitySnapshot }> {
  private snapshot: CapabilitySnapshot = {
    environmentName: "unknown",
    capabilities: []
  };

  public override initialize(): void {
    this.snapshot = {
      environmentName: this.environment.name,
      capabilities: Array.from(this.environment.capabilities).sort()
    };
    this.emit("changed", this.snapshot);
  }

  public getSnapshot(): CapabilitySnapshot {
    return this.snapshot;
  }

  public hasCapability(capability: string): boolean {
    return this.environment.hasCapability(capability);
  }
}

export class ExperienceStateService extends BaseEventService<{ changed: ExperienceStateSnapshot }, ExperienceStateConfig> {
  private snapshot: ExperienceStateSnapshot = {
    mode: "chat-only",
    widgetState: "closed",
    connectionState: "idle"
  };

  public override initialize(): void {
    const config = this.serviceConfig ?? {};
    this.snapshot = {
      mode: config.initialMode ?? "chat-only",
      widgetState: config.initialWidgetState ?? "closed",
      connectionState: "idle"
    };
    this.emit("changed", this.snapshot);
  }

  public getSnapshot(): ExperienceStateSnapshot {
    return this.snapshot;
  }

  public setMode(mode: ExperienceStateSnapshot["mode"]): void {
    this.snapshot = {
      ...this.snapshot,
      mode
    };
    this.emit("changed", this.snapshot);
  }

  public openWidget(): void {
    this.snapshot = {
      ...this.snapshot,
      widgetState: "open"
    };
    this.emit("changed", this.snapshot);
  }

  public minimizeWidget(): void {
    this.snapshot = {
      ...this.snapshot,
      widgetState: "minimized"
    };
    this.emit("changed", this.snapshot);
  }

  public closeWidget(): void {
    this.snapshot = {
      ...this.snapshot,
      widgetState: "closed"
    };
    this.emit("changed", this.snapshot);
  }

  public setConnectionState(connectionState: ConnectionState, lastError?: string): void {
    this.snapshot = {
      ...this.snapshot,
      connectionState,
      ...(lastError ? { lastError } : {})
    };

    if (!lastError && "lastError" in this.snapshot) {
      this.snapshot = {
        mode: this.snapshot.mode,
        widgetState: this.snapshot.widgetState,
        connectionState: this.snapshot.connectionState
      };
    }

    this.emit("changed", this.snapshot);
  }
}

export class SessionService extends BaseEventService<{ changed: SessionSnapshot }, SessionServiceConfig> {
  private snapshot: SessionSnapshot = {
    sessionId: "session-0",
    createdAt: 0,
    lastActivityAt: 0
  };

  public override initialize(): void {
    const config = this.serviceConfig ?? {};
    const timestamp = getNow(config.now);
    this.snapshot = {
      sessionId: config.sessionId ?? `${this.serviceName}-${timestamp}`,
      createdAt: timestamp,
      lastActivityAt: timestamp
    };
    this.emit("changed", this.snapshot);
  }

  public getSnapshot(): SessionSnapshot {
    return this.snapshot;
  }

  public touch(): void {
    const config = this.serviceConfig ?? {};
    this.snapshot = {
      ...this.snapshot,
      lastActivityAt: getNow(config.now)
    };
    this.emit("changed", this.snapshot);
  }
}

export class ContentContextService extends BaseEventService<{ changed: ContentContextSnapshot }, ContentContextSnapshot> {
  private snapshot: ContentContextSnapshot = {};

  public override initialize(): void {
    this.snapshot = {
      ...this.serviceConfig
    };
    this.emit("changed", this.snapshot);
  }

  public getSnapshot(): ContentContextSnapshot {
    return this.snapshot;
  }

  public mergeContext(context: Partial<ContentContextSnapshot>): void {
    this.snapshot = {
      ...this.snapshot,
      ...context
    };
    this.emit("changed", this.snapshot);
  }

  public setGeolocation(latitude: number, longitude: number): void {
    this.snapshot = {
      ...this.snapshot,
      geolocation: {
        latitude,
        longitude
      }
    };
    this.emit("changed", this.snapshot);
  }
}

export abstract class BaseBackendAdapterModule<TConfig>
  extends BaseServiceModule<BackendAdapterService, TConfig> {
  public abstract readonly adapterKind: BackendAdapterKind;
  public abstract send(request: BackendConversationRequest): Promise<BackendConversationResponse>;
}

export class MockBackendAdapterModule extends BaseBackendAdapterModule<MockBackendAdapterConfig> {
  public readonly adapterKind = "mock" as const;

  public async send(request: BackendConversationRequest): Promise<BackendConversationResponse> {
    const config = this.serviceConfig ?? {};
    return {
      adapter: this.adapterKind,
      content: `${config.replyPrefix ?? "Mock reply"}: ${request.message}`,
      timestamp: getNow(config.now)
    };
  }
}

export class RestBackendAdapterModule extends BaseBackendAdapterModule<RestBackendAdapterConfig> {
  public readonly adapterKind = "rest" as const;

  public async send(request: BackendConversationRequest): Promise<BackendConversationResponse> {
    const config = this.serviceConfig ?? {};

    if (!config.endpoint) {
      throw new Error("REST adapter endpoint is required.");
    }

    const fetchFn = config.fetchFn ?? globalThis.fetch?.bind(globalThis);

    if (!fetchFn) {
      throw new Error("REST adapter fetch implementation is required.");
    }

    const response = await fetchFn(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...config.headers
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`REST adapter request failed with status ${response.status}.`);
    }

    const payload = await response.json() as Record<string, unknown>;

    if (typeof payload.message !== "string") {
      throw new Error("REST adapter response must include a string message field.");
    }

    return {
      adapter: this.adapterKind,
      content: payload.message,
      timestamp: getNow(config.now)
    };
  }
}

export class BackendAdapterService extends BaseEventService<{ changed: BackendAdapterStateSnapshot }, BackendAdapterServiceConfig> {
  private snapshot: BackendAdapterStateSnapshot = {
    preferredAdapter: "mock",
    state: "idle"
  };

  public override initialize(): void {
    const config = this.serviceConfig ?? {};
    this.snapshot = {
      preferredAdapter: config.preferredAdapter ?? "mock",
      state: "idle"
    };
    this.emit("changed", this.snapshot);
  }

  public getSnapshot(): BackendAdapterStateSnapshot {
    return this.snapshot;
  }

  public setPreferredAdapter(preferredAdapter: BackendAdapterKind): void {
    this.snapshot = {
      ...this.snapshot,
      preferredAdapter
    };
    this.emit("changed", this.snapshot);
  }

  public async sendMessage(request: BackendConversationRequest): Promise<BackendConversationResponse> {
    const module = this.resolveModule();
    this.snapshot = {
      ...this.snapshot,
      activeAdapter: module.adapterKind,
      state: "sending"
    };
    this.emit("changed", this.snapshot);

    try {
      const response = await module.send(request);
      this.snapshot = {
        preferredAdapter: this.snapshot.preferredAdapter,
        activeAdapter: response.adapter,
        state: "ready"
      };
      this.emit("changed", this.snapshot);
      return response;
    } catch (error) {
      this.snapshot = {
        ...this.snapshot,
        state: "error",
        lastError: getErrorMessage(error)
      };
      this.emit("changed", this.snapshot);
      throw error;
    }
  }

  private resolveModule(): BaseBackendAdapterModule<unknown> {
    const modules = this.serviceModules.filter((serviceModule): serviceModule is BaseBackendAdapterModule<unknown> =>
      serviceModule instanceof BaseBackendAdapterModule);

    if (modules.length === 0) {
      throw new Error("No backend adapter modules are registered.");
    }

    return modules.find((module) => module.adapterKind === this.snapshot.preferredAdapter) ?? modules[0]!;
  }
}

export class ConversationService extends BaseEventService<{ changed: ConversationSnapshot }, ConversationServiceConfig> {
  private snapshot: ConversationSnapshot = {
    messages: [],
    status: "idle"
  };

  private sequence = 0;

  public constructor(
    context: ConstructorParameters<typeof BaseEventService<{ changed: ConversationSnapshot }, ConversationServiceConfig>>[0],
    private readonly sessionService: SessionService,
    private readonly backendAdapterService: BackendAdapterService,
    private readonly contentContextService: ContentContextService,
    private readonly experienceStateService: ExperienceStateService
  ) {
    super(context);
  }

  public override initialize(): void {
    const config = this.serviceConfig ?? {};

    if (config.welcomeMessage) {
      this.snapshot = {
        messages: [this.createMessage("assistant", config.welcomeMessage)],
        status: "idle"
      };
    }

    this.emit("changed", this.snapshot);
  }

  public getSnapshot(): ConversationSnapshot {
    return this.snapshot;
  }

  public async sendUserMessage(message: string): Promise<ConversationMessage> {
    const userMessage = this.createMessage("user", message);
    this.snapshot = {
      messages: [...this.snapshot.messages, userMessage],
      status: "sending"
    };
    this.experienceStateService.openWidget();
    this.experienceStateService.setConnectionState("sending");
    this.emit("changed", this.snapshot);

    try {
      const response = await this.backendAdapterService.sendMessage({
        sessionId: this.sessionService.getSnapshot().sessionId,
        message,
        context: this.contentContextService.getSnapshot()
      });

      const assistantMessage = this.createMessage("assistant", response.content, response.timestamp);
      this.snapshot = {
        messages: [...this.snapshot.messages, assistantMessage],
        status: "ready"
      };
      this.sessionService.touch();
      this.experienceStateService.setConnectionState("ready");
      this.emit("changed", this.snapshot);
      return assistantMessage;
    } catch (error) {
      const lastError = getErrorMessage(error);
      this.snapshot = {
        ...this.snapshot,
        status: "error",
        lastError
      };
      this.experienceStateService.setConnectionState("error", lastError);
      this.emit("changed", this.snapshot);
      throw error;
    }
  }

  private createMessage(role: ConversationMessage["role"], content: string, timestamp?: number): ConversationMessage {
    const config = this.serviceConfig ?? {};
    this.sequence += 1;
    return {
      id: `${role}-${this.sequence}`,
      role,
      content,
      timestamp: timestamp ?? getNow(config.now)
    };
  }
}

export class RenderStateService extends BaseEventService<{ changed: RenderStateSnapshot }> {
  private snapshot: RenderStateSnapshot = {
    timestamp: 0,
    deltaTime: 0,
    frame: 0,
    source: "idle"
  };

  public getSnapshot(): RenderStateSnapshot {
    return this.snapshot;
  }

  public override render(context: LifecycleContext): void {
    this.snapshot = context;
    this.emit("changed", this.snapshot);
  }
}
