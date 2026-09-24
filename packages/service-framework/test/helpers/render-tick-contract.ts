/**
 * The shared `renderTick` contract, hosted in this repository's runner. The
 * checks ship from `src/render-tick-contract-cases.ts`.
 */
import { describe, it } from "vitest";
import { renderTickContractCases, type RenderTickSubject } from "../../src/index.js";

export function renderTickContract(name: string, factory: () => RenderTickSubject): void {
  describe(`renderTick contract: ${name}`, () => {
    for (const contractCase of renderTickContractCases()) {
      it(contractCase.name, () => contractCase.run(factory()));
    }
  });
}
