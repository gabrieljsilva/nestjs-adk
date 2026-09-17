import type { ContractCase } from "./contract-case.support";

/**
 * Every expectation a port demands from any implementation of it, as data rather than as a
 * test file: the suite yields cases and the caller's own runner drives them.
 */
export abstract class ContractSuite<TSubject> {
	public abstract readonly port: string;

	public abstract cases(create: () => TSubject): ContractCase[];
}
