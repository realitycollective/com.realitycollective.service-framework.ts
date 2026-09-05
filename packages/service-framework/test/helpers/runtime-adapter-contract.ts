/**
 * The vitest wrapper around the shipped runtime-adapter conformance suite.
 *
 * The suite itself lives in `src/contract-cases.ts` and is published, so an
 * adapter written outside this repository can prove it conforms. This is the
 * in-repo runner: a loop that turns each shipped case into a vitest test, so
 * the four adapter test files read exactly as they did before.
 */
import { describe, it } from "vitest";
import { runtimeAdapterContractCases, type RuntimeAdapterSubject } from "../../src/index.js";

export type { RuntimeAdapterDriver, RuntimeAdapterSubject } from "../../src/index.js";

/**
 * @param name     shown in the test output, e.g. `"MockRuntimeAdapter"`.
 * @param factory  builds a fresh subject per case. The adapter it returns must
 *                 start with no session.
 */
export function runtimeAdapterContract(name: string, factory: () => RuntimeAdapterSubject): void {
  describe(`RuntimeAdapter contract: ${name}`, () => {
    for (const contractCase of runtimeAdapterContractCases()) {
      it(contractCase.name, () => contractCase.run(factory()));
    }
  });
}
