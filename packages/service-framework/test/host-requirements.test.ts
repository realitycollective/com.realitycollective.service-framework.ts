/**
 * The README's "Host requirements" table and the capability override rule,
 * checked against the source so neither can drift.
 *
 * A native host embeds a bare engine and supplies only what the core needs, so
 * the table must name exactly the host globals the core calls at runtime: no
 * fewer, or the host fails to boot, and no more, or it implements something
 * nobody uses.
 */
import { listPackageDir, readPackageText } from "./helpers/package-files.mjs";

const readme = readPackageText("README.md");

/** Globals a browser or Node provides that an embedded engine may not. */
const HOST_GLOBALS = [
  "AbortController", "AbortSignal", "cancelAnimationFrame", "clearImmediate", "clearInterval",
  "clearTimeout", "console", "crypto", "document", "EventTarget", "fetch", "localStorage",
  "MessageChannel", "navigator", "performance", "process", "queueMicrotask", "requestAnimationFrame",
  "setImmediate", "setInterval", "setTimeout", "structuredClone", "TextDecoder", "TextEncoder",
  "URL", "WebSocket", "window", "Worker", "XMLHttpRequest"
];

/** Comments and string contents say nothing about what the code calls, so both go. */
function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

/** A runtime use: a call, a construction, a member read or a default value. Type positions do not count. */
function usedAtRuntime(source: string, name: string): boolean {
  const patterns = [
    new RegExp(`(?<![\\w.]|typeof\\s)${name}\\s*\\(`),
    new RegExp(`\\bnew\\s+${name}\\b`),
    new RegExp(`(?<![\\w.])${name}\\.`),
    new RegExp(`\\?\\?\\s*${name}\\b`)
  ];
  return patterns.some((pattern) => pattern.test(source));
}

function hostRequirementsSection(): string {
  const start = readme.indexOf("## Host requirements");
  expect(start, "the README must have a Host requirements section").toBeGreaterThanOrEqual(0);
  const next = readme.indexOf("\n## ", start + 1);
  return readme.slice(start, next === -1 ? undefined : next);
}

describe("host requirements", () => {
  it("lists exactly the host globals the core uses at runtime", () => {
    const source = listPackageDir("src/")
      .filter((file) => file.endsWith(".ts"))
      .map((file) => stripCommentsAndStrings(readPackageText(`src/${file}`)))
      .join("\n");
    const used = HOST_GLOBALS.filter((name) => usedAtRuntime(source, name)).sort();

    const tableRows = hostRequirementsSection().split("\n").filter((line) => line.startsWith("| `"));
    const listed = tableRows
      .flatMap((row) => [...(row.split("|")[1] ?? "").matchAll(/`(\w+)`/g)].map((match) => match[1]))
      .sort();

    expect(listed).toEqual(used);
  });
});

describe("capability override rule", () => {
  const adapters = [
    { name: "MockRuntimeAdapter", file: "service-framework/src/mock-runtime-adapter.ts", derives: false },
    { name: "IWSDKAdapter", file: "service-framework-iwsdk/src/iwsdk-adapter.ts", derives: true },
    { name: "WebXRRuntimeAdapter", file: "service-framework-three/src/webxr-runtime-adapter.ts", derives: true },
    { name: "BabylonRuntimeAdapter", file: "service-framework-babylon/src/babylon-runtime-adapter.ts", derives: true }
  ];

  it("is stated in the README and on the RuntimeAdapter interface", () => {
    const interfaceSource = readPackageText("src/runtime-adapter.ts");
    const interfaceDoc = interfaceSource.slice(0, interfaceSource.indexOf("export interface RuntimeAdapter "));

    for (const text of [readme, interfaceDoc]) {
      expect(text).toContain("setCapabilities(partial: Partial<AdapterCapabilities>)");
      expect(text).toContain("clearCapabilityOverrides()");
      expect(text).toMatch(/sticky override/);
    }
  });

  it.each(adapters)("is followed by $name", ({ name, file, derives }) => {
    const source = readPackageText(`../${file}`);

    expect(readme).toContain(`\`${name}\``);
    expect(source).toMatch(/public setCapabilities\(capabilities: Partial<AdapterCapabilities>\): void/);

    if (derives) {
      expect(source).toMatch(/public clearCapabilityOverrides\(\): void/);
    }
  });
});
