import type { IEnvironmentDescriptor } from "./contracts.js";
export declare class EnvironmentDescriptor implements IEnvironmentDescriptor {
    readonly name: string;
    readonly capabilities: ReadonlySet<string>;
    constructor(name: string, capabilities?: Iterable<string>);
    hasCapability(capability: string): boolean;
}
export declare function createEnvironmentDescriptor(name: string, capabilities?: Iterable<string>): EnvironmentDescriptor;
export declare function createBrowserEnvironment(): EnvironmentDescriptor;
//# sourceMappingURL=environment.d.ts.map