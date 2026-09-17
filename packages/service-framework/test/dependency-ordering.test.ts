/**
 * The registration ordering rule for constructor injection, stated as tests.
 *
 * The manager constructs registrations in priority order (lower first, default
 * 10) and, within equal priority, in the order the profile lists them. A
 * dependency is resolved at the moment its dependant is constructed, so it must
 * already have been constructed by then. The manager checks the dependency
 * graph for cycles before constructing anything, but it does not reorder the
 * profile to satisfy dependencies. These tests pin that behaviour so a change
 * to it is a deliberate one.
 */
import {
  BaseService,
  BaseServiceModule,
  ServiceManager,
  createServiceProfile,
  createServiceToken,
  type ServiceActivationContext
} from "../src/index.js";

const constructed: string[] = [];

class Logger extends BaseService {
  public constructor(context: ServiceActivationContext) {
    super(context);
    constructed.push(context.name);
  }
}

class Counter extends BaseService {
  public constructor(
    context: ServiceActivationContext,
    public readonly logger: Logger
  ) {
    super(context);
    constructed.push(context.name);
  }
}

class Parent extends BaseService {
  public constructor(context: ServiceActivationContext) {
    super(context);
    constructed.push(context.name);
  }
}

class FirstModule extends BaseServiceModule<Parent> {
  public constructor(context: ServiceActivationContext<unknown, Parent>) {
    super(context);
    constructed.push(context.name);
  }
}

class SecondModule extends BaseServiceModule<Parent> {
  public constructor(
    context: ServiceActivationContext<unknown, Parent>,
    public readonly first: FirstModule
  ) {
    super(context);
    constructed.push(context.name);
  }
}

const LOGGER = createServiceToken<Logger>("logger");
const COUNTER = createServiceToken<Counter>("counter");
const PARENT = createServiceToken<Parent>("parent");
const FIRST = createServiceToken<FirstModule>("first-module");
const SECOND = createServiceToken<SecondModule>("second-module");

describe("dependency injection ordering rule", () => {
  beforeEach(() => {
    constructed.length = 0;
  });

  it("constructs a dependant after its dependency when the dependency is listed first at equal priority", () => {
    const manager = new ServiceManager();

    manager.initializeProfile(createServiceProfile("dependency-first", [
      { token: LOGGER, useClass: Logger },
      { token: COUNTER, dependencies: [LOGGER], useClass: Counter }
    ]));

    expect(constructed).toEqual(["logger", "counter"]);
    expect(manager.resolve(COUNTER).logger).toBe(manager.resolve(LOGGER));
  });

  it("constructs the dependency first when it has a lower priority number, whatever the profile order", () => {
    const manager = new ServiceManager();

    manager.initializeProfile(createServiceProfile("priority-wins", [
      { token: COUNTER, dependencies: [LOGGER], useClass: Counter },
      { token: LOGGER, priority: 1, useClass: Logger }
    ]));

    expect(constructed).toEqual(["logger", "counter"]);
    expect(manager.resolve(COUNTER).logger).toBe(manager.resolve(LOGGER));
  });

  it("throws when a dependant is listed before its dependency at equal priority: the profile is not reordered by dependencies", () => {
    const manager = new ServiceManager();

    expect(() => manager.initializeProfile(createServiceProfile("dependant-first", [
      { token: COUNTER, dependencies: [LOGGER], useClass: Counter },
      { token: LOGGER, useClass: Logger }
    ]))).toThrow('Unable to resolve service "logger".');

    expect(constructed).toEqual([]);
  });

  it("throws when a dependant has a lower priority number than its dependency: priority is not overridden by dependencies", () => {
    const manager = new ServiceManager();

    expect(() => manager.initializeProfile(createServiceProfile("priority-inverted", [
      { token: LOGGER, useClass: Logger },
      { token: COUNTER, priority: 1, dependencies: [LOGGER], useClass: Counter }
    ]))).toThrow('Unable to resolve service "logger".');

    expect(constructed).toEqual([]);
  });

  it("injects an already-running service into a registration added later with register()", () => {
    const manager = new ServiceManager();

    manager.initializeProfile(createServiceProfile("late", [
      { token: LOGGER, useClass: Logger }
    ]));
    manager.start();

    const counter = manager.register({ token: COUNTER, dependencies: [LOGGER], useClass: Counter });

    expect(constructed).toEqual(["logger", "counter"]);
    expect(counter.logger).toBe(manager.resolve(LOGGER));
    expect(counter.isStarted).toBe(true);
  });

  it("rejects a dependency cycle before constructing anything", () => {
    const manager = new ServiceManager();
    const a = createServiceToken<Logger>("cycle-a");
    const b = createServiceToken<Logger>("cycle-b");

    expect(() => manager.initializeProfile(createServiceProfile("cycle", [
      { token: a, dependencies: [b], useClass: Logger },
      { token: b, dependencies: [a], useClass: Logger }
    ]))).toThrow('Circular dependency detected while ordering "cycle-a".');

    expect(constructed).toEqual([]);
  });

  it("applies the same rule to sibling modules: a module may depend on a sibling listed before it", () => {
    const manager = new ServiceManager();

    manager.initializeProfile(createServiceProfile("modules-ordered", [
      {
        token: PARENT,
        useClass: Parent,
        modules: [
          { token: FIRST, useClass: FirstModule },
          { token: SECOND, dependencies: [FIRST], useClass: SecondModule }
        ]
      }
    ]));

    expect(constructed).toEqual(["parent", "first-module", "second-module"]);
    expect(manager.resolve(SECOND).first).toBe(manager.resolve(FIRST));
  });

  it("applies the same rule to sibling modules: a module depending on a sibling listed after it throws", () => {
    const manager = new ServiceManager();

    expect(() => manager.initializeProfile(createServiceProfile("modules-unordered", [
      {
        token: PARENT,
        useClass: Parent,
        modules: [
          { token: SECOND, dependencies: [FIRST], useClass: SecondModule },
          { token: FIRST, useClass: FirstModule }
        ]
      }
    ]))).toThrow('Unable to resolve service "first-module".');

    expect(constructed).toEqual(["parent"]);
  });
});
