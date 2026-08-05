import type { RunLimits } from "../../domain/session/run-limits";
import { ToolInvalidArgsError } from "../../domain/tool/errors/tool-invalid-args.error";
import { ToolRepeatedFailureError } from "../../domain/tool/errors/tool-repeated-failure.error";

/**
 * Counts what keeps going wrong with one tool, and stops the run when it has been told
 * the same thing too many times.
 *
 * Counting is per tool and per run, and a success clears it: a tool that failed twice
 * and then worked is a tool that had a bad minute, not a broken one. Invalid arguments
 * and failures are counted apart because they mean different things, and an application
 * bounds them separately.
 *
 * It belongs to one run. Two concurrent commands never share one, so a tool failing in
 * somebody else's conversation never stops this one.
 */
export class ToolBreaker {
	private readonly failures = new Map<string, number>();
	private readonly invalidArgs = new Map<string, number>();

	public constructor(private readonly limits: RunLimits) {}

	public recordSuccess(toolName: string): void {
		this.failures.delete(toolName);
		this.invalidArgs.delete(toolName);
	}

	/** A valid call clears the invalid streak and leaves the failure streak alone. */
	public recordValidArgs(toolName: string): void {
		this.invalidArgs.delete(toolName);
	}

	public recordInvalidArgs(toolName: string, reason: string): void {
		const seen = (this.invalidArgs.get(toolName) ?? 0) + 1;
		this.invalidArgs.set(toolName, seen);
		if (!this.limits.allowsInvalidArgs(seen)) throw new ToolInvalidArgsError(toolName, seen, reason);
	}

	public recordFailure(toolName: string, reason: string): void {
		const seen = (this.failures.get(toolName) ?? 0) + 1;
		this.failures.set(toolName, seen);
		if (!this.limits.allowsToolFailures(seen)) throw new ToolRepeatedFailureError(toolName, seen, reason);
	}

	public failuresOf(toolName: string): number {
		return this.failures.get(toolName) ?? 0;
	}

	public invalidArgsOf(toolName: string): number {
		return this.invalidArgs.get(toolName) ?? 0;
	}
}
