import { describe, it, expect } from "vitest";
import { ManualScheduler, ServiceManager, createServiceToken } from "@realitycollective/service-framework";
import { SnapshotService, type ServiceContext } from "../src/index.js";

interface CounterSnapshot {
  readonly count: number;
  readonly label: string;
}

class CounterService extends SnapshotService<unknown, CounterSnapshot> {
  public constructor(context: ServiceContext) {
    super(context, { count: 0, label: "start" });
  }

  public increment(): void {
    this.updateSnapshot({ count: this.getSnapshot().count + 1 });
  }

  public replace(snapshot: CounterSnapshot): void {
    this.publishSnapshot(snapshot);
  }
}

const COUNTER_TOKEN = createServiceToken<CounterService>("CounterService");

function makeContext(): ServiceContext {
  const scheduler = new ManualScheduler();
  const manager = new ServiceManager({ scheduler });
  return {
    name: "CounterService",
    priority: 10,
    config: undefined,
    manager,
    scheduler,
    environment: manager.environment,
    signal: new AbortController().signal,
  };
}

describe("SnapshotService", () => {
  it("delivers the current snapshot immediately on subscribe", () => {
    const service = new CounterService(makeContext());
    let received: CounterSnapshot | undefined;
    service.subscribe((snapshot) => (received = snapshot));
    expect(received).toEqual({ count: 0, label: "start" });
  });

  it("updateSnapshot merges a partial and notifies subscribers", () => {
    const service = new CounterService(makeContext());
    const seen: CounterSnapshot[] = [];
    service.subscribe((snapshot) => seen.push(snapshot));

    service.increment();

    // [initial, after-increment]
    expect(seen).toHaveLength(2);
    expect(seen[1]).toEqual({ count: 1, label: "start" });
    expect(service.getSnapshot()).toEqual({ count: 1, label: "start" });
  });

  it("publishSnapshot replaces the whole snapshot", () => {
    const service = new CounterService(makeContext());
    service.replace({ count: 9, label: "done" });
    expect(service.getSnapshot()).toEqual({ count: 9, label: "done" });
  });

  it("stops notifying after unsubscribe", () => {
    const service = new CounterService(makeContext());
    let calls = 0;
    const unsubscribe = service.subscribe(() => calls++);

    service.increment(); // calls = 2 (initial + update)
    unsubscribe();
    service.increment(); // no further notifications

    expect(calls).toBe(2);
  });

  it("notifies multiple independent subscribers", () => {
    const service = new CounterService(makeContext());
    const a: number[] = [];
    const b: number[] = [];
    service.subscribe((snapshot) => a.push(snapshot.count));
    service.subscribe((snapshot) => b.push(snapshot.count));

    service.increment();

    expect(a).toEqual([0, 1]);
    expect(b).toEqual([0, 1]);
  });

  it("registers, initializes and starts through the ServiceManager", () => {
    const manager = new ServiceManager();
    manager.initializeProfile({
      name: "snapshot-test",
      services: [
        {
          token: COUNTER_TOKEN,
          useFactory: (context) => new CounterService(context),
        },
      ],
    });
    manager.start();

    const resolved = manager.resolve(COUNTER_TOKEN);
    resolved.increment();

    expect(resolved).toBeInstanceOf(CounterService);
    expect(resolved.getSnapshot().count).toBe(1);
  });
});
