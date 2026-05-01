import React from "react";
import type { IEnvironmentDescriptor, IScheduler, IService, ServiceProfile } from "@realitycollective/service-framework";
import { ServiceManager, ServiceToken } from "@realitycollective/service-framework";
export interface ServiceFrameworkProviderProps {
    readonly children?: React.ReactNode;
    readonly manager?: ServiceManager;
    readonly profile?: ServiceProfile;
    readonly autoStart?: boolean;
    readonly scheduler?: IScheduler;
    readonly environment?: IEnvironmentDescriptor;
}
export declare function ServiceFrameworkProvider({ children, manager, profile, autoStart, scheduler, environment }: ServiceFrameworkProviderProps): React.JSX.Element;
export declare function useServiceManager(): ServiceManager;
export declare function useService<TService extends IService>(token: ServiceToken<TService>, name?: string): TService;
export declare function useServices<TService extends IService>(token: ServiceToken<TService>): readonly TService[];
//# sourceMappingURL=index.d.ts.map