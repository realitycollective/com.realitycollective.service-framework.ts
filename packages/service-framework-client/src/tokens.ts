import { createServiceToken } from "@realitycollective/service-framework";
import type {
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

export const CAPABILITY_SERVICE_TOKEN = createServiceToken<CapabilityService>("CapabilityService");
export const EXPERIENCE_STATE_SERVICE_TOKEN = createServiceToken<ExperienceStateService>("ExperienceStateService");
export const SESSION_SERVICE_TOKEN = createServiceToken<SessionService>("SessionService");
export const CONTENT_CONTEXT_SERVICE_TOKEN = createServiceToken<ContentContextService>("ContentContextService");
export const BACKEND_ADAPTER_SERVICE_TOKEN = createServiceToken<BackendAdapterService>("BackendAdapterService");
export const CONVERSATION_SERVICE_TOKEN = createServiceToken<ConversationService>("ConversationService");
export const RENDER_STATE_SERVICE_TOKEN = createServiceToken<RenderStateService>("RenderStateService");
export const MOCK_BACKEND_ADAPTER_MODULE_TOKEN = createServiceToken<MockBackendAdapterModule>("MockBackendAdapterModule");
export const REST_BACKEND_ADAPTER_MODULE_TOKEN = createServiceToken<RestBackendAdapterModule>("RestBackendAdapterModule");
