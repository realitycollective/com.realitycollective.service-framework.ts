import { describe, it, expect } from "vitest";
import { ManualScheduler, ServiceManager, ServiceToken } from "@realitycollective/service-framework";
import type { ServiceActivationContext, LifecycleContext } from "@realitycollective/service-framework";
import { BaseBabylonService, type BabylonServiceConfiguration } from "../src/index.js";

// ---------------------------------------------------------------------------
// Test doubles — structural mocks, no @babylonjs/core import needed.
// The generics on BabylonServiceConfiguration let consumers pass real Babylon
// types; here we pass typed mocks to exercise the base class in isolation.
// ---------------------------------------------------------------------------

const mockEngine = {
  runRenderLoop: (_cb: () => void) => {},
  stopRenderLoop: (_cb: () => void) => {},
  resize: () => {},
} as const;

const mockScene = {
  render: () => {},
  getMeshByName: (_name: string) => null,
  dispose: () => {},
} as const;

type MockEngine = typeof mockEngine;
type MockScene  = typeof mockScene;
type TestConfig = BabylonServiceConfiguration<MockEngine, MockScene>;

const TEST_TOKEN = new ServiceToken<ConcreteService>("TestBabylonService");

class ConcreteService extends BaseBabylonService<TestConfig> {
  public renderTickCallCount = 0;

  public override onRenderTick(_context: LifecycleContext): void {
    this.renderTickCallCount++;
  }

  // Expose protected getters for assertions
  public getEngine() { return this.engine; }
  public getScene()  { return this.scene; }
}

function makeContext(): ServiceActivationContext<TestConfig> {
  const scheduler = new ManualScheduler();
  const manager   = new ServiceManager({ scheduler });
  return {
    name:        "TestBabylonService",
    priority:    10,
    config:      { engine: mockEngine, scene: mockScene },
    manager,
    scheduler,
    environment: manager.environment,
    signal:      new AbortController().signal,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BaseBabylonService", () => {
  it("exposes engine from serviceConfig", () => {
    const svc = new ConcreteService(makeContext());
    expect(svc.getEngine()).toBe(mockEngine);
  });

  it("exposes scene from serviceConfig", () => {
    const svc = new ConcreteService(makeContext());
    expect(svc.getScene()).toBe(mockScene);
  });

  it("engine getter is typed with the consumer's engine type", () => {
    const svc = new ConcreteService(makeContext());
    // Type-level assertion: resize() exists on the returned type
    expect(typeof svc.getEngine().resize).toBe("function");
  });

  it("scene getter is typed with the consumer's scene type", () => {
    const svc = new ConcreteService(makeContext());
    expect(typeof svc.getScene().render).toBe("function");
  });

  it("onRenderTick base implementation is a no-op that does not throw", () => {
    const svc = new ConcreteService(makeContext());
    expect(() => svc.onRenderTick({} as LifecycleContext)).not.toThrow();
  });

  it("onRenderTick is overrideable and called the correct number of times", () => {
    const svc = new ConcreteService(makeContext());
    svc.onRenderTick({} as LifecycleContext);
    svc.onRenderTick({} as LifecycleContext);
    expect(svc.renderTickCallCount).toBe(2);
  });

  it("serviceName is set from the activation context", () => {
    const svc = new ConcreteService(makeContext());
    expect(svc.serviceName).toBe("TestBabylonService");
  });

  it("serviceConfig holds the config passed through the context", () => {
    const svc = new ConcreteService(makeContext());
    expect(svc.serviceConfig.engine).toBe(mockEngine);
    expect(svc.serviceConfig.scene).toBe(mockScene);
  });

  it("registers and resolves via ServiceManager", () => {
    const scheduler = new ManualScheduler();
    const manager   = new ServiceManager({ scheduler });
    manager.initializeProfile({
      name: "test-profile",
      services: [
        {
          token:      TEST_TOKEN,
          useFactory: (ctx) =>
            new ConcreteService(ctx as ServiceActivationContext<TestConfig>),
          config: { engine: mockEngine, scene: mockScene },
        },
      ],
    });
    manager.start();
    const resolved = manager.resolve(TEST_TOKEN);
    expect(resolved).toBeInstanceOf(ConcreteService);
    expect(resolved.getEngine()).toBe(mockEngine);
  });
});
