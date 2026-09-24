/**
 * The shared `HostIO` contract, hosted in this repository's runner. The
 * checks ship from `src/host-io-contract-cases.ts` as `hostIOContractCases()`,
 * so a native app proves conformance on device the same way.
 */
import { describe, it } from "vitest";
import { hostIOContractCases, type HostIOSubject } from "../../src/index.js";

export function hostIOContract(name: string, factory: () => HostIOSubject): void {
  describe(`HostIO contract: ${name}`, () => {
    for (const contractCase of hostIOContractCases()) {
      it(contractCase.name, () => contractCase.run(factory()));
    }
  });
}
