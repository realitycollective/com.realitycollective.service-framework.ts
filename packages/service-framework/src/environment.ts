import type { IEnvironmentDescriptor } from "./contracts.js";

export class EnvironmentDescriptor implements IEnvironmentDescriptor {
  public readonly capabilities: ReadonlySet<string>;

  public constructor(public readonly name: string, capabilities: Iterable<string> = []) {
    this.capabilities = new Set(capabilities);
  }

  public hasCapability(capability: string): boolean {
    return this.capabilities.has(capability);
  }
}

export function createEnvironmentDescriptor(name: string, capabilities: Iterable<string> = []): EnvironmentDescriptor {
  return new EnvironmentDescriptor(name, capabilities);
}

export function createBrowserEnvironment(): EnvironmentDescriptor {
  return new EnvironmentDescriptor("browser", ["dom", "focus", "visibility", "timers", "render-loop"]);
}
