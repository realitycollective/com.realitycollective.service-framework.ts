import { describe, it, expect } from "vitest";
import { createServiceProfile, createServiceToken } from "@realitycollective/service-framework";
import {
  IWSDKAdapter,
  SnapshotService,
  startServiceRuntime,
  type IWSDKWorldLike,
  type RuntimeAdapter,
  type ServiceContext,
} from "../src/index.js";

interface TickSnapshot {
  readonly ticks: number;
}

class FrameCounterService extends SnapshotService<unknown, TickSnapshot> {
  public constructor(
    context: ServiceContext,
    private readonly adapter: RuntimeAdapter,
  ) {
    super(context, { ticks: 0 });
  }

  public override initialize(): void {
    this.adapter.onFrame(() => this.updateSnapshot({ ticks: this.getSnapshot().ticks + 1 }));
  }
}

const COUNTER_TOKEN = createServiceToken<FrameCounterService>("FrameCounterService");
const world: IWSDKWorldLike = { visibilityState: { value: "visible" } };

describe("startServiceRuntime", () => {
  it("passes the constructed adapter to the profile factory", () => {
    let received: IWSDKAdapter | undefined;
    const runtime = startServiceRuntime(world, (adapter) => {
      received = adapter;
      return createServiceProfile("bootstrap-test", []);
    });

    expect(received).toBe(runtime.adapter);
  });

  it("returns an IWSDKAdapter bound to the supplied world", () => {
    const runtime = startServiceRuntime(world, () => createServiceProfile("bootstrap-test", []));
    expect(runtime.adapter).toBeInstanceOf(IWSDKAdapter);
    expect(runtime.adapter.getWorld()).toBe(world);
  });

  it("initializes and starts the manager", () => {
    const runtime = startServiceRuntime(world, () => createServiceProfile("bootstrap-test", []));
    expect(runtime.manager.isInitialized).toBe(true);
    expect(runtime.manager.isStarted).toBe(true);
  });

  it("wires registered services to the adapter's frame fan-out", () => {
    const runtime = startServiceRuntime(world, (adapter) =>
      createServiceProfile("bootstrap-test", [
        {
          token: COUNTER_TOKEN,
          useFactory: (context) => new FrameCounterService(context, adapter),
        },
      ]),
    );

    const service = runtime.manager.resolve(COUNTER_TOKEN);
    expect(service.getSnapshot().ticks).toBe(0);

    runtime.adapter.emitFrame(0, 0.016);
    runtime.adapter.emitFrame(16, 0.016);

    expect(service.getSnapshot().ticks).toBe(2);
  });
});
