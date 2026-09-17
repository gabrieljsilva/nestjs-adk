/**
 * One executable expectation of a port contract.
 * The case owns the assertion; the test runner only gives it a name and runs it,
 * which is what keeps the suites usable from vitest, jest or node:test alike.
 */
export class ContractCase {
	public constructor(
		public readonly name: string,
		public readonly run: () => void | Promise<void>,
	) {}
}
