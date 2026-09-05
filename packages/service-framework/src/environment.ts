import type { IEnvironmentDescriptor } from "./contracts.js";

/**
 * The platform environment a service is running in: a name plus the capability
 * strings the host offers, such as `"dom"` or `"render-loop"`. Configuration
 * profiles gate on it, so a service can register differently on a browser page
 * and in a headless test.
 *
 * Not to be confused with `EnvironmentSpec` from
 * `@realitycollective/webxr-environment`, which describes the visual
 * environment - sky, fog and lighting. The two are unrelated, and an app can
 * hold both at once: this one answers "what can the host do", that one answers
 * "what does the world look like".
 */
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
