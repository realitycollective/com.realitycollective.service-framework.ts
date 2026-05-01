import { jsx as _jsx } from "react/jsx-runtime";
import { useMemo, useSyncExternalStore } from "react";
import { ServiceFrameworkProvider, useService } from "@realitycollective/service-framework-react";
import { BaseFrameworkClientRuntime } from "./runtime.js";
import { BACKEND_ADAPTER_SERVICE_TOKEN, CAPABILITY_SERVICE_TOKEN, CONTENT_CONTEXT_SERVICE_TOKEN, CONVERSATION_SERVICE_TOKEN, EXPERIENCE_STATE_SERVICE_TOKEN, RENDER_STATE_SERVICE_TOKEN, SESSION_SERVICE_TOKEN } from "./tokens.js";
function useSnapshotService(token) {
    const service = useService(token);
    return useSyncExternalStore(
    /* v8 ignore next 3 */
    (onStoreChange) => service.on("changed", () => {
        onStoreChange();
    }), () => service.getSnapshot(), () => service.getSnapshot());
}
export function BaseFrameworkClientProvider({ children, runtime, runtimeOptions }) {
    const resolvedRuntime = useMemo(() => runtime ?? new BaseFrameworkClientRuntime(runtimeOptions), [runtime, runtimeOptions]);
    return (_jsx(ServiceFrameworkProvider, { manager: resolvedRuntime.manager, autoStart: false, children: children }));
}
export function useCapabilityService() {
    return useService(CAPABILITY_SERVICE_TOKEN);
}
export function useCapabilityState() {
    return useSnapshotService(CAPABILITY_SERVICE_TOKEN);
}
export function useExperienceStateService() {
    return useService(EXPERIENCE_STATE_SERVICE_TOKEN);
}
export function useExperienceState() {
    return useSnapshotService(EXPERIENCE_STATE_SERVICE_TOKEN);
}
export function useSessionService() {
    return useService(SESSION_SERVICE_TOKEN);
}
export function useSessionState() {
    return useSnapshotService(SESSION_SERVICE_TOKEN);
}
export function useContentContextService() {
    return useService(CONTENT_CONTEXT_SERVICE_TOKEN);
}
export function useContentContext() {
    return useSnapshotService(CONTENT_CONTEXT_SERVICE_TOKEN);
}
export function useBackendAdapterService() {
    return useService(BACKEND_ADAPTER_SERVICE_TOKEN);
}
export function useBackendAdapterState() {
    return useSnapshotService(BACKEND_ADAPTER_SERVICE_TOKEN);
}
export function useConversationService() {
    return useService(CONVERSATION_SERVICE_TOKEN);
}
export function useConversationState() {
    return useSnapshotService(CONVERSATION_SERVICE_TOKEN);
}
export function useRenderStateService() {
    return useService(RENDER_STATE_SERVICE_TOKEN);
}
export function useRenderState() {
    return useSnapshotService(RENDER_STATE_SERVICE_TOKEN);
}
//# sourceMappingURL=react.js.map