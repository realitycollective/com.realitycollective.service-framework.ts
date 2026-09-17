/**
 * Sinks decide where records go. The framework has no opinion about any of
 * these; they are application code.
 */
import type { TelemetryRecord, TelemetrySink } from "./collector.js";

/** Holds records for display and export. The one the example UI reads. */
export class MemorySink implements TelemetrySink {
  public readonly name = "memory";
  public readonly records: TelemetryRecord[] = [];

  public constructor(private readonly onWrite?: (records: readonly TelemetryRecord[]) => void) {}

  public write(records: readonly TelemetryRecord[]): void {
    this.records.push(...records);
    this.onWrite?.(records);
  }

  public clear(): void {
    this.records.length = 0;
  }

  /** One JSON object per line: greppable, diffable, and pasteable into a ticket. */
  public toNdjson(): string {
    return this.records.map((record) => JSON.stringify(record)).join("\n");
  }
}

const CONSOLE_METHOD = {
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error"
} as const;

/**
 * Mirrors records to the devtools console, routed by `level`. Routing on a
 * field rather than parsing the name is why `level` exists.
 */
export class ConsoleSink implements TelemetrySink {
  public readonly name = "console";

  public write(records: readonly TelemetryRecord[]): void {
    for (const record of records) {
      const method = CONSOLE_METHOD[record.level];
      // eslint-disable-next-line no-console
      console[method](`[${record.seq}] ${record.name}`, record.payload ?? {});
    }
  }
}
