/**
 * Hosts with no `AbortController`, such as the Hermes engine a native host
 * embeds, must still boot a profile. The manager falls back to a minimal
 * controller whose signal behaves the way a service reads it.
 */
import { createAbortController } from "../src/abort-controller.js";
import {
  BaseService,
  ServiceManager,
  createServiceProfile,
  createServiceToken,
  type ServiceContext
} from "../src/index.js";

class Watcher extends BaseService {
  public abortCalls = 0;

  public constructor(context: ServiceContext) {
    super(context);
    context.signal.addEventListener("abort", () => {
      this.abortCalls += 1;
    });
  }
}

const FIRST = createServiceToken<Watcher>("first");
const SECOND = createServiceToken<Watcher>("second");

const nativeAbortController = globalThis.AbortController;

function removeAbortController(): void {
  delete (globalThis as { AbortController?: unknown }).AbortController;
}

describe("AbortController fallback", () => {
  afterEach(() => {
    globalThis.AbortController = nativeAbortController;
  });

  it("boots a profile with no global AbortController and aborts each service signal once on dispose", () => {
    removeAbortController();
    const manager = new ServiceManager();

    manager.initializeProfile(createServiceProfile("hermes", [
      { token: FIRST, useClass: Watcher },
      { token: SECOND, useClass: Watcher }
    ]));

    const first = manager.resolve(FIRST);
    const second = manager.resolve(SECOND);
    expect(first.abortSignal.aborted).toBe(false);
    expect(second.abortSignal.aborted).toBe(false);

    manager.dispose();

    expect(first.abortSignal.aborted).toBe(true);
    expect(second.abortSignal.aborted).toBe(true);
    expect(first.abortCalls).toBe(1);
    expect(second.abortCalls).toBe(1);
  });

  it("uses the host's AbortController when one is present", () => {
    const controller = createAbortController();

    expect(controller).toBeInstanceOf(nativeAbortController);
  });

  it("gives the fallback signal aborted, reason, onabort and add/removeEventListener, and fires once", () => {
    removeAbortController();
    const controller = createAbortController();
    const signal = controller.signal;
    const heard: string[] = [];
    const removed = (): void => {
      heard.push("removed");
    };

    expect(controller).not.toBeInstanceOf(nativeAbortController);
    expect(signal.aborted).toBe(false);
    expect(signal.reason).toBeUndefined();

    signal.onabort = (event) => {
      heard.push(`onabort:${event.type}`);
    };
    signal.addEventListener("abort", (event) => {
      heard.push(`listener:${event.type}`);
    });
    signal.addEventListener("abort", removed);
    signal.removeEventListener("abort", removed);
    // Only "abort" is dispatched, so other event types are ignored.
    signal.addEventListener("other" as "abort", removed);
    signal.removeEventListener("other" as "abort", removed);

    controller.abort("first");
    controller.abort("second");

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe("first");
    expect(heard).toEqual(["onabort:abort", "listener:abort"]);
  });

  it("gives the fallback signal a default reason when abort() is called without one", () => {
    removeAbortController();
    const controller = createAbortController();

    controller.abort();

    expect(controller.signal.reason).toBeInstanceOf(Error);
  });
});
