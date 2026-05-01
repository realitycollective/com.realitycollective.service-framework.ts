import { jsx as _jsx } from "react/jsx-runtime";
/* v8 ignore file */
import { createContext, useContext, useMemo } from "react";
import { ServiceManager } from "@realitycollective/service-framework";
const ServiceFrameworkContext = createContext(null);
export function ServiceFrameworkProvider({ children, manager, profile, autoStart = true, scheduler, environment }) {
    const resolvedManager = useMemo(() => {
        const instance = manager ?? new ServiceManager({
            ...(scheduler ? { scheduler } : {}),
            ...(environment ? { environment } : {})
        });
        if (profile && !instance.isInitialized) {
            instance.initializeProfile(profile);
        }
        if (autoStart && !instance.isStarted) {
            instance.start();
        }
        return instance;
    }, [autoStart, environment, manager, profile, scheduler]);
    return (_jsx(ServiceFrameworkContext.Provider, { value: resolvedManager, children: children }));
}
export function useServiceManager() {
    const manager = useContext(ServiceFrameworkContext);
    if (!manager) {
        throw new Error("ServiceFrameworkProvider is required before calling useServiceManager.");
    }
    return manager;
}
export function useService(token, name) {
    return useServiceManager().resolve(token, name);
}
export function useServices(token) {
    return useServiceManager().resolveAll(token);
}
//# sourceMappingURL=index.js.map