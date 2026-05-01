import React, { useMemo, useSyncExternalStore } from "react";
import { type ServiceToken } from "@realitycollective/service-framework";
import { ServiceFrameworkProvider, useService } from "@realitycollective/service-framework-react";
import type {
  BaseFrameworkClientProviderProps,
  ChangeAwareService
} from "./contracts.js";
import { BaseFrameworkClientRuntime } from "./runtime.js";
import {
  BACKEND_ADAPTER_SERVICE_TOKEN,
  CAPABILITY_SERVICE_TOKEN,
  CONTENT_CONTEXT_SERVICE_TOKEN,
  CONVERSATION_SERVICE_TOKEN,
  EXPERIENCE_STATE_SERVICE_TOKEN,
  RENDER_STATE_SERVICE_TOKEN,
  SESSION_SERVICE_TOKEN
} from "./tokens.js";
import type {
  BackendAdapterStateSnapshot,
  CapabilitySnapshot,
  ContentContextSnapshot,
  ConversationSnapshot,
  ExperienceStateSnapshot,
  RenderStateSnapshot,
  SessionSnapshot
} from "./contracts.js";
import {
  BackendAdapterService,
  CapabilityService,
  ContentContextService,
  ConversationService,
  ExperienceStateService,
  RenderStateService,
  SessionService
} from "./services.js";

function useSnapshotService<TSnapshot, TService extends ChangeAwareService<TSnapshot>>(token: ServiceToken<TService>): TSnapshot {
  const service = useService(token);
  return useSyncExternalStore(
    /* v8 ignore next 3 */
    (onStoreChange) => service.on("changed", () => {
      onStoreChange();
    }),
    () => service.getSnapshot(),
    () => service.getSnapshot()
  );
}

export function BaseFrameworkClientProvider({
  children,
  runtime,
  runtimeOptions
}: BaseFrameworkClientProviderProps): React.JSX.Element {
  const resolvedRuntime = useMemo(() => runtime ?? new BaseFrameworkClientRuntime(runtimeOptions), [runtime, runtimeOptions]);

  return (
    <ServiceFrameworkProvider manager={resolvedRuntime.manager} autoStart={false}>
      {children}
    </ServiceFrameworkProvider>
  );
}

export function useCapabilityService(): CapabilityService {
  return useService(CAPABILITY_SERVICE_TOKEN);
}

export function useCapabilityState(): CapabilitySnapshot {
  return useSnapshotService<CapabilitySnapshot, CapabilityService>(CAPABILITY_SERVICE_TOKEN);
}

export function useExperienceStateService(): ExperienceStateService {
  return useService(EXPERIENCE_STATE_SERVICE_TOKEN);
}

export function useExperienceState(): ExperienceStateSnapshot {
  return useSnapshotService<ExperienceStateSnapshot, ExperienceStateService>(EXPERIENCE_STATE_SERVICE_TOKEN);
}

export function useSessionService(): SessionService {
  return useService(SESSION_SERVICE_TOKEN);
}

export function useSessionState(): SessionSnapshot {
  return useSnapshotService<SessionSnapshot, SessionService>(SESSION_SERVICE_TOKEN);
}

export function useContentContextService(): ContentContextService {
  return useService(CONTENT_CONTEXT_SERVICE_TOKEN);
}

export function useContentContext(): ContentContextSnapshot {
  return useSnapshotService<ContentContextSnapshot, ContentContextService>(CONTENT_CONTEXT_SERVICE_TOKEN);
}

export function useBackendAdapterService(): BackendAdapterService {
  return useService(BACKEND_ADAPTER_SERVICE_TOKEN);
}

export function useBackendAdapterState(): BackendAdapterStateSnapshot {
  return useSnapshotService<BackendAdapterStateSnapshot, BackendAdapterService>(BACKEND_ADAPTER_SERVICE_TOKEN);
}

export function useConversationService(): ConversationService {
  return useService(CONVERSATION_SERVICE_TOKEN);
}

export function useConversationState(): ConversationSnapshot {
  return useSnapshotService<ConversationSnapshot, ConversationService>(CONVERSATION_SERVICE_TOKEN);
}

export function useRenderStateService(): RenderStateService {
  return useService(RENDER_STATE_SERVICE_TOKEN);
}

export function useRenderState(): RenderStateSnapshot {
  return useSnapshotService<RenderStateSnapshot, RenderStateService>(RENDER_STATE_SERVICE_TOKEN);
}
