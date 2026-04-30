import {
  BaseEventService,
  BaseService,
  BaseServiceModule,
  createBrowserEnvironment,
  createServiceToken,
  type FocusChangeContext,
  type LifecycleContext
} from "../src/index.js";

class AliasService extends BaseService {
  public readonly calls: string[] = [];

  public override initialize(): void {
    this.calls.push("initialize");
  }

  public override start(): void {
    this.calls.push("start");
  }

  public override reset(): void {
    this.calls.push("reset");
  }

  public override update(_context: LifecycleContext): void {
    this.calls.push("update");
  }

  public override lateUpdate(_context: LifecycleContext): void {
    this.calls.push("lateUpdate");
  }

  public override fixedUpdate(_context: LifecycleContext): void {
    this.calls.push("fixedUpdate");
  }

  public override render(_context: LifecycleContext): void {
    this.calls.push("render");
  }

  public override destroy(): void {
    this.calls.push("destroy");
  }

  public override onFocusChange(_context: FocusChangeContext): void {
    this.calls.push("focus");
  }

  public override onPauseChange(): void {
    this.calls.push("pause");
  }
}

class DummyParent extends BaseService {}
class DummyModule extends BaseServiceModule<DummyParent> {}

class ExampleEventService extends BaseEventService<{ ping: number; pong: string }> {}

function createLifecycleContext(source: string): LifecycleContext {
  return {
    timestamp: 10,
    deltaTime: 10,
    frame: 1,
    source
  };
}

describe("aliases and event services", () => {
  it("supports lifecycle aliases and module registration helpers", () => {
    const service = new AliasService({
      name: "alias",
      priority: 1,
      config: {},
      manager: {} as never,
      scheduler: {} as never,
      environment: {} as never,
      signal: new AbortController().signal
    });
    const parent = new DummyParent({
      name: "parent",
      priority: 1,
      config: {},
      manager: {} as never,
      scheduler: {} as never,
      environment: {} as never,
      signal: new AbortController().signal
    });
    const module = new DummyModule({
      name: "module",
      priority: 2,
      config: {},
      parent,
      manager: {} as never,
      scheduler: {} as never,
      environment: {} as never,
      signal: new AbortController().signal
    });

    service.Initialize();
    service.Start();
    service.Reset();
    service.Update(createLifecycleContext("tick"));
    service.LateUpdate(createLifecycleContext("late"));
    service.FixedUpdate(createLifecycleContext("fixed"));
    service.Render(createLifecycleContext("render"));
    service.OnFocusChange({ focused: true });
    service.OnPauseChange({ paused: true });
    service.Destroy();

    parent.registerServiceModule(module);
    parent.registerServiceModule(module);
    parent.unregisterServiceModule(module);
    parent.unregisterServiceModule(module);
    service._setDestroyedState(true);

    expect(service.calls).toEqual([
      "initialize",
      "start",
      "reset",
      "update",
      "lateUpdate",
      "fixedUpdate",
      "render",
      "focus",
      "pause",
      "destroy"
    ]);
    expect(service.isEnabled).toBe(false);
    expect(parent.serviceModules).toHaveLength(0);
    expect(module.parentService).toBe(parent);
    expect(() => new DummyModule({
      name: "broken-module",
      priority: 1,
      config: {},
      manager: {} as never,
      scheduler: {} as never,
      environment: {} as never,
      signal: new AbortController().signal
    } as never)).toThrow('Service module "broken-module" requires a parent service.');
    expect(createBrowserEnvironment().hasCapability("render-loop")).toBe(true);
  });

  it("registers, emits, removes and counts event listeners", () => {
    const service = new ExampleEventService({
      name: "events",
      priority: 1,
      config: {},
      manager: {} as never,
      scheduler: {} as never,
      environment: {} as never,
      signal: new AbortController().signal
    });
    const calls: string[] = [];
    const firstHandler = (value: number) => {
      calls.push(`first:${value}`);
    };
    const secondHandler = (value: string) => {
      calls.push(`second:${value}`);
    };

    service.emit("ping", 1);
    const unregisterFirst = service.on("ping", firstHandler);
    service.once("pong", secondHandler);

    expect(service.listenerCount("ping")).toBe(1);
    expect(service.listenerCount("pong")).toBe(1);

    service.emit("ping", 2);
    service.emit("pong", "ok");
    service.emit("pong", "ignored");

    unregisterFirst();
    service.off("ping", firstHandler);

    expect(service.listenerCount("ping")).toBe(0);
    expect(service.listenerCount("pong")).toBe(0);
    expect(calls).toEqual(["first:2", "second:ok"]);
    expect(createServiceToken("token").toString()).toBe("token");
  });
});
