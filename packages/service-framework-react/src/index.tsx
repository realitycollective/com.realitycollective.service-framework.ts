/* v8 ignore file */
import React, { createContext, useContext, useMemo } from "react";
import type {
  IEnvironmentDescriptor,
  IScheduler,
  IService,
  ServiceProfile
} from "@realitycollective/service-framework";
import { ServiceManager, ServiceToken } from "@realitycollective/service-framework";

export interface ServiceFrameworkProviderProps {
  readonly children?: React.ReactNode;
  readonly manager?: ServiceManager;
  readonly profile?: ServiceProfile;
  readonly autoStart?: boolean;
  readonly scheduler?: IScheduler;
  readonly environment?: IEnvironmentDescriptor;
}

const ServiceFrameworkContext = createContext<ServiceManager | null>(null);

export function ServiceFrameworkProvider({
  children,
  manager,
  profile,
  autoStart = true,
  scheduler,
  environment
}: ServiceFrameworkProviderProps): React.JSX.Element {
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

  return (
    <ServiceFrameworkContext.Provider value={resolvedManager}>
      {children}
    </ServiceFrameworkContext.Provider>
  );
}

export function useServiceManager(): ServiceManager {
  const manager = useContext(ServiceFrameworkContext);

  if (!manager) {
    throw new Error("ServiceFrameworkProvider is required before calling useServiceManager.");
  }

  return manager;
}

export function useService<TService extends IService>(token: ServiceToken<TService>, name?: string): TService {
  return useServiceManager().resolve(token, name);
}

export function useServices<TService extends IService>(token: ServiceToken<TService>): readonly TService[] {
  return useServiceManager().resolveAll(token);
}
