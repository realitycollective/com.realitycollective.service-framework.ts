export class EnvironmentDescriptor {
    name;
    capabilities;
    constructor(name, capabilities = []) {
        this.name = name;
        this.capabilities = new Set(capabilities);
    }
    hasCapability(capability) {
        return this.capabilities.has(capability);
    }
}
export function createEnvironmentDescriptor(name, capabilities = []) {
    return new EnvironmentDescriptor(name, capabilities);
}
export function createBrowserEnvironment() {
    return new EnvironmentDescriptor("browser", ["dom", "focus", "visibility", "timers", "render-loop"]);
}
//# sourceMappingURL=environment.js.map