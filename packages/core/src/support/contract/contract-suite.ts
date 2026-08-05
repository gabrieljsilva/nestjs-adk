import type { ContractCase } from "./contract-case";

/**
 * Every expectation a port demands from any implementation of it.
 * A suite is data, not a test file: it yields cases and the spec drives them, so the
 * same suite runs against the in memory adapter here and against a durable one downstream.
 */
export abstract class ContractSuite<TSubject> {
	/** Name of the port under contract, used to label the generated test group. */
	public abstract readonly port: string;

	public abstract cases(create: () => TSubject): ContractCase[];
}
