// Node file access for tests, kept out of the .ts tests so the core package
// type-checks without node's typings. Paths are relative to the package root.
import { readFileSync, readdirSync } from "node:fs";

const packageRoot = new URL("../../", import.meta.url);

export function readPackageText(path) {
  return readFileSync(new URL(path, packageRoot), "utf8");
}

export function listPackageDir(path) {
  return readdirSync(new URL(path, packageRoot));
}
