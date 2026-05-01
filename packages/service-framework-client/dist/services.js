import { BaseEventService, BaseServiceModule } from "@realitycollective/service-framework";
function getNow(now) {
    return (now ?? Date.now)();
}
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
export class CapabilityService extends BaseEventService {
    snapshot = {
        environmentName: "unknown",
        capabilities: []
    };
    initialize() {
        this.snapshot = {
            environmentName: this.environment.name,
            capabilities: Array.from(this.environment.capabilities).sort()
        };
        this.emit("changed", this.snapshot);
    }
    getSnapshot() {
        return this.snapshot;
    }
    hasCapability(capability) {
        return this.environment.hasCapability(capability);
    }
}
export class ExperienceStateService extends BaseEventService {
    snapshot = {
        mode: "chat-only",
        widgetState: "closed",
        connectionState: "idle"
    };
    initialize() {
        const config = this.serviceConfig ?? {};
        this.snapshot = {
            mode: config.initialMode ?? "chat-only",
            widgetState: config.initialWidgetState ?? "closed",
            connectionState: "idle"
        };
        this.emit("changed", this.snapshot);
    }
    getSnapshot() {
        return this.snapshot;
    }
    setMode(mode) {
        this.snapshot = {
            ...this.snapshot,
            mode
        };
        this.emit("changed", this.snapshot);
    }
    openWidget() {
        this.snapshot = {
            ...this.snapshot,
            widgetState: "open"
        };
        this.emit("changed", this.snapshot);
    }
    minimizeWidget() {
        this.snapshot = {
            ...this.snapshot,
            widgetState: "minimized"
        };
        this.emit("changed", this.snapshot);
    }
    closeWidget() {
        this.snapshot = {
            ...this.snapshot,
            widgetState: "closed"
        };
        this.emit("changed", this.snapshot);
    }
    setConnectionState(connectionState, lastError) {
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
export class SessionService extends BaseEventService {
    snapshot = {
        sessionId: "session-0",
        createdAt: 0,
        lastActivityAt: 0
    };
    initialize() {
        const config = this.serviceConfig ?? {};
        const timestamp = getNow(config.now);
        this.snapshot = {
            sessionId: config.sessionId ?? `${this.serviceName}-${timestamp}`,
            createdAt: timestamp,
            lastActivityAt: timestamp
        };
        this.emit("changed", this.snapshot);
    }
    getSnapshot() {
        return this.snapshot;
    }
    touch() {
        const config = this.serviceConfig ?? {};
        this.snapshot = {
            ...this.snapshot,
            lastActivityAt: getNow(config.now)
        };
        this.emit("changed", this.snapshot);
    }
}
export class ContentContextService extends BaseEventService {
    snapshot = {};
    initialize() {
        this.snapshot = {
            ...this.serviceConfig
        };
        this.emit("changed", this.snapshot);
    }
    getSnapshot() {
        return this.snapshot;
    }
    mergeContext(context) {
        this.snapshot = {
            ...this.snapshot,
            ...context
        };
        this.emit("changed", this.snapshot);
    }
    setGeolocation(latitude, longitude) {
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
export class BaseBackendAdapterModule extends BaseServiceModule {
}
export class MockBackendAdapterModule extends BaseBackendAdapterModule {
    adapterKind = "mock";
    async send(request) {
        const config = this.serviceConfig ?? {};
        return {
            adapter: this.adapterKind,
            content: `${config.replyPrefix ?? "Mock reply"}: ${request.message}`,
            timestamp: getNow(config.now)
        };
    }
}
export class RestBackendAdapterModule extends BaseBackendAdapterModule {
    adapterKind = "rest";
    async send(request) {
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
        const payload = await response.json();
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
export class BackendAdapterService extends BaseEventService {
    snapshot = {
        preferredAdapter: "mock",
        state: "idle"
    };
    initialize() {
        const config = this.serviceConfig ?? {};
        this.snapshot = {
            preferredAdapter: config.preferredAdapter ?? "mock",
            state: "idle"
        };
        this.emit("changed", this.snapshot);
    }
    getSnapshot() {
        return this.snapshot;
    }
    setPreferredAdapter(preferredAdapter) {
        this.snapshot = {
            ...this.snapshot,
            preferredAdapter
        };
        this.emit("changed", this.snapshot);
    }
    async sendMessage(request) {
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
        }
        catch (error) {
            this.snapshot = {
                ...this.snapshot,
                state: "error",
                lastError: getErrorMessage(error)
            };
            this.emit("changed", this.snapshot);
            throw error;
        }
    }
    resolveModule() {
        const modules = this.serviceModules.filter((serviceModule) => serviceModule instanceof BaseBackendAdapterModule);
        if (modules.length === 0) {
            throw new Error("No backend adapter modules are registered.");
        }
        return modules.find((module) => module.adapterKind === this.snapshot.preferredAdapter) ?? modules[0];
    }
}
export class ConversationService extends BaseEventService {
    sessionService;
    backendAdapterService;
    contentContextService;
    experienceStateService;
    snapshot = {
        messages: [],
        status: "idle"
    };
    sequence = 0;
    constructor(context, sessionService, backendAdapterService, contentContextService, experienceStateService) {
        super(context);
        this.sessionService = sessionService;
        this.backendAdapterService = backendAdapterService;
        this.contentContextService = contentContextService;
        this.experienceStateService = experienceStateService;
    }
    initialize() {
        const config = this.serviceConfig ?? {};
        if (config.welcomeMessage) {
            this.snapshot = {
                messages: [this.createMessage("assistant", config.welcomeMessage)],
                status: "idle"
            };
        }
        this.emit("changed", this.snapshot);
    }
    getSnapshot() {
        return this.snapshot;
    }
    async sendUserMessage(message) {
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
        }
        catch (error) {
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
    createMessage(role, content, timestamp) {
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
export class RenderStateService extends BaseEventService {
    snapshot = {
        timestamp: 0,
        deltaTime: 0,
        frame: 0,
        source: "idle"
    };
    getSnapshot() {
        return this.snapshot;
    }
    render(context) {
        this.snapshot = context;
        this.emit("changed", this.snapshot);
    }
}
//# sourceMappingURL=services.js.map