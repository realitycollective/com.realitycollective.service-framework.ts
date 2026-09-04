/**
 * `SnapshotService` base - the "services own state" pattern. A snapshot service
 * owns one immutable state object and a pub/sub list: consumers (other services,
 * or the presentation layer) subscribe and receive the current value
 * immediately, then every subsequent publish.
 *
 * It depends on nothing but `BaseService`, so services that extend it stay
 * unit-testable headless against {@link MockRuntimeAdapter}.
 */
import { BaseService } from "./base-service.js";

/**
 * The activation-context type a service constructor receives. Aliased here so
 * every service uses one consistent, framework-correct shape (matches the
 * `useFactory(context)` parameter the ServiceManager passes).
 */
export type ServiceContext<TConfig = unknown> =
  ConstructorParameters<typeof BaseService<TConfig>>[0];

export type SnapshotListener<TSnapshot> = (snapshot: TSnapshot) => void;

export abstract class SnapshotService<TConfig, TSnapshot> extends BaseService<TConfig> {
  protected snapshot: TSnapshot;
  private readonly listeners = new Set<SnapshotListener<TSnapshot>>();

  protected constructor(context: ServiceContext<TConfig>, initialSnapshot: TSnapshot) {
    super(context);
    this.snapshot = initialSnapshot;
  }

  public getSnapshot(): TSnapshot {
    return this.snapshot;
  }

  public subscribe(listener: SnapshotListener<TSnapshot>): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  protected publishSnapshot(snapshot: TSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener(this.snapshot));
  }

  protected updateSnapshot(partial: Partial<TSnapshot>): void {
    this.publishSnapshot({ ...this.snapshot, ...partial });
  }
}
