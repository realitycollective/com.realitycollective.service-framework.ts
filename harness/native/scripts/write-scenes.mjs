// Write harness/native/scenes/sf-board.iwsdk.scene.json from the block list (src/blocks.ts), so the
// native host places the same blocks the cook produced from scene-assets.ts. The positions here are
// where the row sits before the board places it in front of the viewer (1.4 m ahead, below eye level).
// Run after changing the blocks: npm run harness:scenes
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const out = resolve(here, "../build/scene");
mkdirSync(out, { recursive: true });
const bundle = resolve(out, "blocks.cjs");
await build({
  entryPoints: [resolve(here, "../src/blocks.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "es2022",
  outfile: bundle,
  logLevel: "warning",
});
const blocks = createRequire(import.meta.url)(bundle);

const round = (n) => Number(n.toFixed(5));
const scenesDir = resolve(here, "../scenes");
mkdirSync(scenesDir, { recursive: true });
const spacing = 0.3;
const doc = {
  version: "iwsdk.scene.v1",
  units: "meters",
  metadata: {
    "com.realitycollective.service-framework-harness": `The Service Framework harness board "${blocks.SCENE_ID}", generated from harness/native/src/blocks.ts by harness/native/scripts/write-scenes.mjs.`,
  },
  resources: {},
  nodes: blocks.BLOCKS.map((block, i) => ({
    id: block.id,
    name: block.id,
    transform: { position: [round((i - (blocks.BLOCKS.length - 1) / 2) * spacing), 0.9, -1.4] },
    content: { type: "asset", asset: block.id },
  })),
};
const target = resolve(scenesDir, blocks.SCENE_FILE);
writeFileSync(target, JSON.stringify(doc, null, 2) + "\n");
console.log(JSON.stringify({ step: "scene", file: target, nodes: doc.nodes.length }));
