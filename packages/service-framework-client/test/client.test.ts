import {
  ManualScheduler,
  createEnvironmentDescriptor
} from "@realitycollective/service-framework";
import {
  BACKEND_ADAPTER_SERVICE_TOKEN,
  BaseBackendAdapterModule,
  BaseFrameworkClientRuntime,
  BackendAdapterService,
  CapabilityService,
  ContentContextService,
  ConversationService,
  ExperienceStateService,
  MockBackendAdapterModule,
  RenderStateService,
  RestBackendAdapterModule,
  SessionService,
  createBaseFrameworkClientEnvironment,
  createBaseFrameworkClientProfile
} from "../src/index.js";

class StringThrowingModule extends BaseBackendAdapterModule<undefined> {
  public readonly adapterKind = "mock" as const;

  public async send(): Promise<never> {
    throw "plain failure";
  }
}

function createServiceContext<TConfig>(name: string, config: TConfig) {
  return {
    name,
    priority: 1,
    config,
    manager: {} as never,
    scheduler: new ManualScheduler(),
    environment: createEnvironmentDescriptor("test", ["dom", "network", "render-loop"]),
    signal: new AbortController().signal
  };
}

describe("base framework client package", () => {
  it("creates a browser-friendly environment and profile", () => {
    const environment = createBaseFrameworkClientEnvironment({
      capabilities: ["webgl", "geolocation"]
    });
    const noDefaultsEnvironment = createBaseFrameworkClientEnvironment({ includeBrowserDefaults: false });
    expect(noDefaultsEnvironment.hasCapability("dom")).toBe(false);
    const profile = createBaseFrameworkClientProfile({
      backend: {
        rest: {
          endpoint: "/chat"
        }
      }
    });

    expect(environment.hasCapability("dom")).toBe(true);
    expect(environment.hasCapability("webgl")).toBe(true);
    expect(profile.services.map((service) => service.name)).toEqual([
      "capabilities",
      "experience",
      "session",
      "content-context",
      "backend-adapter",
      "conversation",
      "render-state"
    ]);
    expect(profile.services.find((service) => service.token === BACKEND_ADAPTER_SERVICE_TOKEN)?.modules).toHaveLength(2);

    const restRuntime = new BaseFrameworkClientRuntime({
      profileOptions: {
        backend: {
          includeMockAdapter: false,
          rest: {
            endpoint: "/chat",
            fetchFn: async () => ({
              ok: true,
              status: 200,
              async json() {
                return {
                  message: "rest-runtime"
                };
              }
            })
          }
        }
      }
    });
    restRuntime.dispose();
  });

  it("drives the default mock-backed conversation runtime and render loop", async () => {
    let animationLoop: ((timestamp: number) => void) | null = null;
    const runtime = new BaseFrameworkClientRuntime({
      profileOptions: {
        session: {
          now: () => 10
        },
        conversation: {
          now: () => 100,
          welcomeMessage: "Welcome"
        },
        context: {
          page: "/chat",
          campaign: "spring"
        },
        backend: {
          mock: {
            now: () => 200,
            replyPrefix: "Echo"
          }
        }
      }
    });

    const capabilityService = runtime.manager.resolve(BACKEND_ADAPTER_SERVICE_TOKEN).manager.resolve(
      (await import("../src/tokens.js")).CAPABILITY_SERVICE_TOKEN
    ) as CapabilityService;
    const sessionService = runtime.manager.resolve((await import("../src/tokens.js")).SESSION_SERVICE_TOKEN) as SessionService;
    const contextService = runtime.manager.resolve((await import("../src/tokens.js")).CONTENT_CONTEXT_SERVICE_TOKEN) as ContentContextService;
    const experienceService = runtime.manager.resolve((await import("../src/tokens.js")).EXPERIENCE_STATE_SERVICE_TOKEN) as ExperienceStateService;
    const conversationService = runtime.manager.resolve((await import("../src/tokens.js")).CONVERSATION_SERVICE_TOKEN) as ConversationService;
    const renderStateService = runtime.manager.resolve((await import("../src/tokens.js")).RENDER_STATE_SERVICE_TOKEN) as RenderStateService;

    expect(capabilityService.getSnapshot().capabilities).toContain("dom");
    expect(capabilityService.hasCapability("dom")).toBe(true);
    expect(sessionService.getSnapshot().sessionId).toBe("session-10");
    expect(conversationService.getSnapshot().messages[0]?.content).toBe("Welcome");

    contextService.setGeolocation(10.5, 11.5);
    experienceService.openWidget();
    experienceService.setMode("avatar");
    experienceService.minimizeWidget();
    experienceService.closeWidget();

    await conversationService.sendUserMessage("Where am I?");

    runtime.bindRenderLoop({
      setAnimationLoop(callback) {
        animationLoop = callback;
      }
    });
    const currentAnimationLoop = animationLoop as ((timestamp: number) => void) | null;
    if (currentAnimationLoop) {
      currentAnimationLoop(16);
    }

    expect(contextService.getSnapshot().geolocation).toEqual({
      latitude: 10.5,
      longitude: 11.5
    });
    expect(experienceService.getSnapshot()).toEqual({
      mode: "avatar",
      widgetState: "open",
      connectionState: "ready"
    });

    experienceService.setConnectionState("error", "temporary");
    experienceService.setConnectionState("ready");
    expect(experienceService.getSnapshot()).toEqual({
      mode: "avatar",
      widgetState: "open",
      connectionState: "ready"
    });
    expect(conversationService.getSnapshot().messages.map((message) => message.content)).toEqual([
      "Welcome",
      "Where am I?",
      "Echo: Where am I?"
    ]);
    expect(renderStateService.getSnapshot().frame).toBe(1);

    runtime.dispose();
  });

  it("supports explicit ids, backend fallback, rest success, and error propagation", async () => {
    const experience = new ExperienceStateService(createServiceContext("experience", {}));
    experience.initialize();

    const session = new SessionService(createServiceContext("session", {
      now: () => 1,
      sessionId: "existing-session"
    }));
    session.initialize();

    const context = new ContentContextService(createServiceContext("context", {
      page: "/start"
    }));
    context.initialize();
    context.mergeContext({
      campaign: "launch"
    });

    const backend = new BackendAdapterService(createServiceContext("backend", {
      preferredAdapter: "rest"
    }));
    backend.initialize();

    const mockModule = new MockBackendAdapterModule({
      ...createServiceContext("mock-module", {
        replyPrefix: "Fallback",
        now: () => 2
      }),
      parent: backend
    });

    const fallbackResponse = await backend.sendMessage({
      sessionId: session.getSnapshot().sessionId,
      message: "hello",
      context: context.getSnapshot()
    });

    const restModule = new RestBackendAdapterModule({
      ...createServiceContext("rest-module", {
        endpoint: "/chat",
        now: () => 3,
        fetchFn: async () => ({
          ok: true,
          status: 200,
          async json() {
            return {
              message: "REST reply"
            };
          }
        })
      }),
      parent: backend
    });

    backend.setPreferredAdapter("rest");
    const restResponse = await backend.sendMessage({
      sessionId: "existing-session",
      message: "use rest",
      context: context.getSnapshot()
    });

    const failingBackend = new BackendAdapterService(createServiceContext("failing-backend", {
      preferredAdapter: "rest"
    }));
    failingBackend.initialize();

    const failingRestModuleConfig = createServiceContext("failing-rest", {
      endpoint: "/chat",
      fetchFn: async () => ({
        ok: false,
        status: 500,
        async json() {
          return {
            message: "ignored"
          };
        }
      })
    });
    const failingRestModule = new RestBackendAdapterModule({
      ...failingRestModuleConfig,
      parent: failingBackend
    });
    const conversationContext = createServiceContext("conversation", {
      now: () => 4
    });
    const conversation = new ConversationService(conversationContext, session, failingBackend, context, experience);

    expect(mockModule.adapterKind).toBe("mock");
    expect(restModule.adapterKind).toBe("rest");
    expect(failingRestModule.adapterKind).toBe("rest");

    await expect(conversation.sendUserMessage("break")).rejects.toThrow("REST adapter request failed with status 500.");

    expect(fallbackResponse).toEqual({
      adapter: "mock",
      content: "Fallback: hello",
      timestamp: 2
    });
    expect(restResponse).toEqual({
      adapter: "rest",
      content: "REST reply",
      timestamp: 3
    });
    expect(session.getSnapshot().sessionId).toBe("existing-session");
    expect(context.getSnapshot()).toEqual({
      page: "/start",
      campaign: "launch"
    });
    expect(conversation.getSnapshot().status).toBe("error");
    expect(failingBackend.getSnapshot().lastError).toBe("REST adapter request failed with status 500.");
  });

  it("covers direct adapter error paths and runtime startup options", async () => {
    const backend = new BackendAdapterService(createServiceContext("backend", {}));
    backend.initialize();

    await expect(backend.sendMessage({
      sessionId: "missing",
      message: "none",
      context: {}
    })).rejects.toThrow("No backend adapter modules are registered.");

    const endpointlessRestModule = new RestBackendAdapterModule({
      ...createServiceContext("rest-module", {}),
      parent: backend
    });
    await expect(endpointlessRestModule.send({
      sessionId: "session",
      message: "missing-endpoint",
      context: {}
    })).rejects.toThrow("REST adapter endpoint is required.");

    const originalFetch = globalThis.fetch;
    const fetchlessRestModule = new RestBackendAdapterModule({
      ...createServiceContext("fetchless-rest", {
        endpoint: "/chat"
      }),
      parent: backend
    });

    globalThis.fetch = undefined as never;
    await expect(fetchlessRestModule.send({
      sessionId: "session",
      message: "missing-fetch",
      context: {}
    })).rejects.toThrow("REST adapter fetch implementation is required.");
    globalThis.fetch = originalFetch;

    const invalidPayloadRestModule = new RestBackendAdapterModule({
      ...createServiceContext("invalid-rest", {
        endpoint: "/chat",
        fetchFn: async () => ({
          ok: true,
          status: 200,
          async json() {
            return {
              reply: "bad-shape"
            };
          }
        })
      }),
      parent: backend
    });

    await expect(invalidPayloadRestModule.send({
      sessionId: "session",
      message: "bad-shape",
      context: {}
    })).rejects.toThrow("REST adapter response must include a string message field.");

    let firstHostLoop: ((timestamp: number) => void) | null = null;
    let secondHostLoop: ((timestamp: number) => void) | null = null;
    const runtime = new BaseFrameworkClientRuntime({
      autoStart: false
    });

    expect(runtime.manager.isStarted).toBe(false);

    runtime.bindRenderLoop({
      setAnimationLoop(callback) {
        firstHostLoop = callback;
      }
    });
    runtime.bindRenderLoop({
      setAnimationLoop(callback) {
        secondHostLoop = callback;
      }
    });

    expect(firstHostLoop).toBeNull();
    expect(secondHostLoop).not.toBeNull();

    runtime.dispose();
    expect(secondHostLoop).toBeNull();
  });

  it("handles default configs and non-Error backend failures", async () => {
    const backend = new BackendAdapterService(createServiceContext("backend", undefined as unknown as {}));
    backend.initialize();

    const session = new SessionService(createServiceContext("session", undefined as unknown as {}));
    session.initialize();
    session.touch();

    const context = new ContentContextService(createServiceContext("context", undefined as unknown as {}));
    context.initialize();

    const mockModule = new MockBackendAdapterModule({
      ...createServiceContext("mock-default", undefined as unknown as {}),
      parent: backend
    });
    const mockResponse = await mockModule.send({
      sessionId: session.getSnapshot().sessionId,
      message: "default",
      context: context.getSnapshot()
    });

    const failingBackend = new BackendAdapterService(createServiceContext("failing-backend", undefined as unknown as {}));
    failingBackend.initialize();
    const stringThrowingModule = new StringThrowingModule({
      ...createServiceContext<undefined>("string-throwing", undefined),
      parent: failingBackend
    });
    void stringThrowingModule;

    await expect(failingBackend.sendMessage({
      sessionId: session.getSnapshot().sessionId,
      message: "explode",
      context: context.getSnapshot()
    })).rejects.toBe("plain failure");

    const endpointlessRest = new RestBackendAdapterModule({
      ...createServiceContext("rest-default", undefined as unknown as {}),
      parent: backend
    });
    await expect(endpointlessRest.send({
      sessionId: session.getSnapshot().sessionId,
      message: "rest-default",
      context: context.getSnapshot()
    })).rejects.toThrow("REST adapter endpoint is required.");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          message: "global fetch"
        };
      }
    })) as typeof fetch;

    const globalFetchRest = new RestBackendAdapterModule({
      ...createServiceContext("rest-global", {
        endpoint: "/chat"
      }),
      parent: backend
    });
    const globalFetchResponse = await globalFetchRest.send({
      sessionId: session.getSnapshot().sessionId,
      message: "rest-global",
      context: context.getSnapshot()
    });
    globalThis.fetch = originalFetch;

    const conversation = new ConversationService(
      createServiceContext("conversation-default", undefined as unknown as {}),
      session,
      backend,
      context,
      new ExperienceStateService(createServiceContext("experience-default", undefined as unknown as {}))
    );
    conversation.initialize();
    await conversation.sendUserMessage("default-timestamp");

    expect(mockResponse.content).toBe("Mock reply: default");
    expect(globalFetchResponse.content).toBe("global fetch");
    expect(failingBackend.getSnapshot().lastError).toBe("plain failure");
    expect(context.getSnapshot()).toEqual({});
    expect(conversation.getSnapshot().messages[1]?.timestamp).toBeGreaterThanOrEqual(0);
  });
});
