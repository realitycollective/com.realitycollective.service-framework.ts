import {
  createEnvironmentDescriptor,
  createServiceProfile,
  type ServiceProfile,
  type ServiceRegistration
} from "@realitycollective/service-framework";
import type {
  BaseFrameworkClientEnvironmentOptions,
  BaseFrameworkClientProfileOptions
} from "./contracts.js";
import {
  BACKEND_ADAPTER_SERVICE_TOKEN,
  CAPABILITY_SERVICE_TOKEN,
  CONTENT_CONTEXT_SERVICE_TOKEN,
  CONVERSATION_SERVICE_TOKEN,
  EXPERIENCE_STATE_SERVICE_TOKEN,
  MOCK_BACKEND_ADAPTER_MODULE_TOKEN,
  RENDER_STATE_SERVICE_TOKEN,
  REST_BACKEND_ADAPTER_MODULE_TOKEN,
  SESSION_SERVICE_TOKEN
} from "./tokens.js";
import {
  BackendAdapterService,
  CapabilityService,
  ContentContextService,
  ConversationService,
  ExperienceStateService,
  MockBackendAdapterModule,
  RenderStateService,
  RestBackendAdapterModule,
  SessionService
} from "./services.js";

export function createBaseFrameworkClientEnvironment(options: BaseFrameworkClientEnvironmentOptions = {}) {
  const capabilities = new Set<string>();

  if (options.includeBrowserDefaults !== false) {
    capabilities.add("chat");
    capabilities.add("dom");
    capabilities.add("focus");
    capabilities.add("network");
    capabilities.add("render-loop");
    capabilities.add("timers");
    capabilities.add("visibility");
  }

  for (const capability of options.capabilities ?? []) {
    capabilities.add(capability);
  }

  return createEnvironmentDescriptor(options.name ?? "base-framework-client", capabilities);
}

export function createBaseFrameworkClientProfile(options: BaseFrameworkClientProfileOptions = {}): ServiceProfile {
  const backendOptions = options.backend ?? {};
  const backendModules: Array<NonNullable<ServiceRegistration<BackendAdapterService>["modules"]>[number]> = [];

  if (backendOptions.includeMockAdapter !== false) {
    backendModules.push({
      token: MOCK_BACKEND_ADAPTER_MODULE_TOKEN,
      name: "mock-adapter",
      priority: 41,
      ...(backendOptions.mock ? { config: backendOptions.mock } : {}),
      useFactory: (context) => new MockBackendAdapterModule(context as ConstructorParameters<typeof MockBackendAdapterModule>[0])
    } as NonNullable<ServiceRegistration<BackendAdapterService>["modules"]>[number]);
  }

  if (backendOptions.rest?.endpoint) {
    backendModules.push({
      token: REST_BACKEND_ADAPTER_MODULE_TOKEN,
      name: "rest-adapter",
      priority: 42,
      requiredCapabilities: ["network"],
      config: backendOptions.rest,
      useFactory: (context) => new RestBackendAdapterModule(context as ConstructorParameters<typeof RestBackendAdapterModule>[0])
    } as NonNullable<ServiceRegistration<BackendAdapterService>["modules"]>[number]);
  }

  return createServiceProfile(options.profileName ?? "base-framework-client", [
    {
      token: CAPABILITY_SERVICE_TOKEN,
      name: "capabilities",
      priority: 10,
      useFactory: (context) => new CapabilityService(context as ConstructorParameters<typeof CapabilityService>[0])
    },
    {
      token: EXPERIENCE_STATE_SERVICE_TOKEN,
      name: "experience",
      priority: 20,
      config: options.experience,
      useFactory: (context) => new ExperienceStateService(context as ConstructorParameters<typeof ExperienceStateService>[0])
    },
    {
      token: SESSION_SERVICE_TOKEN,
      name: "session",
      priority: 30,
      config: options.session,
      useFactory: (context) => new SessionService(context as ConstructorParameters<typeof SessionService>[0])
    },
    {
      token: CONTENT_CONTEXT_SERVICE_TOKEN,
      name: "content-context",
      priority: 31,
      config: options.context,
      useFactory: (context) => new ContentContextService(context as ConstructorParameters<typeof ContentContextService>[0])
    },
    {
      token: BACKEND_ADAPTER_SERVICE_TOKEN,
      name: "backend-adapter",
      priority: 40,
      config: {
        preferredAdapter: backendOptions.preferredAdapter
      },
      modules: backendModules,
      useFactory: (context) => new BackendAdapterService(context as ConstructorParameters<typeof BackendAdapterService>[0])
    },
    {
      token: CONVERSATION_SERVICE_TOKEN,
      name: "conversation",
      priority: 50,
      config: options.conversation,
      dependencies: [
        SESSION_SERVICE_TOKEN,
        BACKEND_ADAPTER_SERVICE_TOKEN,
        CONTENT_CONTEXT_SERVICE_TOKEN,
        EXPERIENCE_STATE_SERVICE_TOKEN
      ],
      useFactory: (context, sessionService, backendAdapterService, contentContextService, experienceStateService) =>
        new ConversationService(
          context as ConstructorParameters<typeof ConversationService>[0],
          sessionService as SessionService,
          backendAdapterService as BackendAdapterService,
          contentContextService as ContentContextService,
          experienceStateService as ExperienceStateService
        )
    },
    {
      token: RENDER_STATE_SERVICE_TOKEN,
      name: "render-state",
      priority: 60,
      requiredCapabilities: ["render-loop"],
      useFactory: (context) => new RenderStateService(context as ConstructorParameters<typeof RenderStateService>[0])
    }
  ]);
}
