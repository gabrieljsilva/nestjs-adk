/** One executable expectation of a port contract: a name and the assertion to run. */
export class ContractCase {
	public constructor(
		public readonly name: string,
		public readonly run: () => void | Promise<void>,
	) {}
}
