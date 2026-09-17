import type { RunLimits } from "../../domain/session/run/run-limits.value-object";
import { ToolInvalidArgsError } from "../../domain/tool/errors/tool-invalid-args.error";
import { ToolRepeatedFailureError } from "../../domain/tool/errors/tool-repeated-failure.error";

export class ToolBreaker {
	private readonly failures = new Map<string, number>();
	private readonly invalidArgs = new Map<string, number>();

	public constructor(private readonly limits: RunLimits) {}

	public recordSuccess(toolName: string): void {
		this.failures.delete(toolName);
		this.invalidArgs.delete(toolName);
	}

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

	public countFailures(toolName: string): number {
		return this.failures.get(toolName) ?? 0;
	}

	public countInvalidArgs(toolName: string): number {
		return this.invalidArgs.get(toolName) ?? 0;
	}
}
