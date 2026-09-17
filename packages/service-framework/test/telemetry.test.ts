import {
  BaseService,
  ManualScheduler,
  NO_OP_TELEMETRY_LOG,
  ServiceManager,
  createEnvironmentDescriptor,
  createServiceToken,
  type LifecycleContext,
  type ServiceRegistration,
  type TelemetryLevel
} from "../src/index.js";

interface Captured {
  readonly name: string;
  readonly payload: Record<string, unknown> | undefined;
  readonly level: TelemetryLevel | undefined;
}

function collector(): { records: Captured[]; log: (name: string, payload?: Record<string, unknown>, level?: TelemetryLevel) => void } {
  const records: Captured[] = [];
  return {
    records,
    log: (name, payload, level) => {
      records.push({ name, payload, level });
    }
  };
}

const environment = () => createEnvironmentDescriptor("test", ["dom"]);

class Quiet extends BaseService {}

class FailingInit extends BaseService {
  public override initialize(): void {
    throw new Error("hand-tracking capability not granted");
  }
}

class FailingStart extends BaseService {
  public override start(): void {
    throw new Error("renderer was not ready");
  }
}

class ThrowsNonError extends BaseService {
  public override initialize(): void {
    throw "a plain string, not an Error";
  }
}

/**
 * A service that already owns a member called `log`. The seam is `logEvent`
 * precisely so this keeps compiling; the test exists to stop anyone renaming it.
 */
class ClientOwnsLog extends BaseService {
  private readonly log: string[] = ["client owns this name"];

  public read(): string | undefined {
    return this.log[0];
  }
}

function register<TService extends BaseService>(name: string, useClass: unknown): ServiceRegistration {
  return { token: createServiceToken<TService>(name), name, useClass } as unknown as ServiceRegistration;
}

describe("telemetry seam", () => {
  it("uses one shared no-op when nothing is configured", () => {
    const manager = new ServiceManager({ scheduler: new ManualScheduler(), environment: environment() });
    const token = createServiceToken<Quiet>("quiet");

    manager.initializeProfile({ name: "p", services: [{ token, name: "quiet", useClass: Quiet }] });

    expect(manager.logEvent).toBe(NO_OP_TELEMETRY_LOG);
    expect(manager.resolve(token).logEvent).toBe(NO_OP_TELEMETRY_LOG);
    expect(() => manager.resolve(token).logEvent("ignored", { a: 1 }, "debug")).not.toThrow();

    manager.dispose();
  });

  it("reports profile, service and teardown transitions", () => {
    const { records, log } = collector();
    const scheduler = new ManualScheduler();
    const manager = new ServiceManager({ scheduler, environment: environment(), log });

    manager.initializeProfile({ name: "demo", services: [register("quiet", Quiet)] });
    scheduler.emit("startup", undefined);

    const names = () => records.map((record) => record.name);
    expect(names()).toContain("service_initialized");
    expect(names()).toContain("service_started");
    expect(names()).toContain("profile_initialized");
    expect(records.find((record) => record.name === "profile_initialized")?.payload).toMatchObject({
      name: "demo",
      serviceCount: 1
    });

    manager.emitFocusChange(false);
    manager.emitPauseChange({ paused: true });
    expect(records.find((record) => record.name === "focus_change")?.payload).toEqual({ focused: false });
    expect(records.find((record) => record.name === "pause_change")?.payload).toEqual({ paused: true });

    manager.dispose();
    expect(names()).toContain("service_disposed");
    expect(names()).toContain("manager_disposed");

    // dispose is idempotent and must not report twice
    manager.dispose();
    expect(names().filter((name) => name === "manager_disposed")).toHaveLength(1);
  });

  it("emits nothing from any tick channel", () => {
    const { records, log } = collector();
    const scheduler = new ManualScheduler();
    const manager = new ServiceManager({ scheduler, environment: environment(), log });

    manager.initializeProfile({ name: "p", services: [register("quiet", Quiet)] });
    scheduler.emit("startup", undefined);

    const before = records.length;
    for (let frame = 0; frame < 500; frame += 1) {
      const context: LifecycleContext = { timestamp: frame * 11.111, deltaTime: 11.111, frame, source: "test" };
      scheduler.emit("fixedTick", context);
      scheduler.emit("tick", context);
      scheduler.emit("lateTick", context);
      scheduler.emit("renderTick", context);
    }

    expect(records.length).toBe(before);
    manager.dispose();
  });

  it("reports a failed initialize and still throws the original error", () => {
    const { records, log } = collector();
    const manager = new ServiceManager({ scheduler: new ManualScheduler(), environment: environment(), log });

    expect(() => manager.initializeProfile({ name: "p", services: [register("hand-tracking", FailingInit)] }))
      .toThrowError("hand-tracking capability not granted");

    const failure = records.find((record) => record.name === "service_failed");
    expect(failure?.level).toBe("error");
    expect(failure?.payload).toMatchObject({
      name: "hand-tracking",
      phase: "initialize",
      message: "hand-tracking capability not granted"
    });
    expect(records.map((record) => record.name)).not.toContain("service_initialized");
    expect(manager.getDiagnostics().initialized).toBe(false);
  });

  it("reports a failed start and still throws the original error", () => {
    const { records, log } = collector();
    const scheduler = new ManualScheduler();
    const manager = new ServiceManager({ scheduler, environment: environment(), log });

    manager.initializeProfile({ name: "p", services: [register("renderer", FailingStart)] });

    expect(() => manager.start()).toThrowError("renderer was not ready");

    const failure = records.find((record) => record.name === "service_failed");
    expect(failure?.payload).toMatchObject({ name: "renderer", phase: "start", message: "renderer was not ready" });
    expect(records.map((record) => record.name)).not.toContain("service_started");
  });

  it("reports a thrown non-Error as its string form", () => {
    const { records, log } = collector();
    const manager = new ServiceManager({ scheduler: new ManualScheduler(), environment: environment(), log });

    expect(() => manager.initializeProfile({ name: "p", services: [register("odd", ThrowsNonError)] })).toThrow();

    expect(records.find((record) => record.name === "service_failed")?.payload).toMatchObject({
      message: "a plain string, not an Error"
    });
  });

  it("injects the emitter into every service, so application records share the stream", () => {
    const { records, log } = collector();
    const scheduler = new ManualScheduler();
    const manager = new ServiceManager({ scheduler, environment: environment(), log });
    const token = createServiceToken<Quiet>("app");

    manager.initializeProfile({ name: "p", services: [{ token, name: "app", useClass: Quiet }] });
    scheduler.emit("startup", undefined);

    manager.resolve(token).logEvent("item_equipped", { sku: "torch" });

    const application = records.find((record) => record.name === "item_equipped");
    expect(application?.payload).toEqual({ sku: "torch" });
    // the application record arrives after the framework's own, in one order
    expect(records.indexOf(application!)).toBeGreaterThan(
      records.findIndex((record) => record.name === "service_started")
    );

    manager.dispose();
  });

  it("leaves a service's own `log` member alone", () => {
    const { log } = collector();
    const manager = new ServiceManager({ scheduler: new ManualScheduler(), environment: environment(), log });
    const token = createServiceToken<ClientOwnsLog>("client");

    manager.initializeProfile({ name: "p", services: [{ token, name: "client", useClass: ClientOwnsLog }] });

    const service = manager.resolve(token);
    expect(service.read()).toBe("client owns this name");
    expect(typeof service.logEvent).toBe("function");

    manager.dispose();
  });

  it("falls back to the no-op when an activation context omits the emitter", () => {
    const scheduler = new ManualScheduler();
    const manager = new ServiceManager({ scheduler, environment: environment() });
    const context = {
      name: "hand-built",
      priority: 10,
      config: undefined,
      manager,
      scheduler,
      environment: environment(),
      signal: new AbortController().signal
    } as ConstructorParameters<typeof BaseService>[0];

    expect(new BaseService(context).logEvent).toBe(NO_OP_TELEMETRY_LOG);
  });
});
