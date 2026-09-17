import { AdkTool, type ToolContext, ToolMetadata } from "@nestjs-adk/core";

/**
 * One call a fake received, with the arguments the model sent.
 */
export interface FakeToolCall {
	readonly args: Readonly<Record<string, unknown>>;
}

/**
 * Replaces what a tool does while keeping its name, schema, effect and identity, so the agent
 * and the approval policy see the tool they always saw. `succeedsWith`, `failsWith` and
 * `executes` say what it answers, and every call it received is recorded.
 */
export class ToolFake extends AdkTool {
	private readonly received: FakeToolCall[] = [];
	private answer: unknown = {};
	private failure?: Error;
	private handler?: (args: Record<string, unknown>, context: ToolContext) => unknown;

	private constructor(public readonly toolName: string) {
		super();
	}

	public static replacing(type: unknown): ToolFake {
		return new ToolFake(ToolMetadata.findOrFail(type).name);
	}

	public succeedsWith(result: unknown): this {
		this.answer = result;
		this.failure = undefined;
		this.handler = undefined;
		return this;
	}

	public failsWith(error: Error): this {
		this.failure = error;
		this.handler = undefined;
		return this;
	}

	public executes(handler: (args: Record<string, unknown>, context: ToolContext) => unknown): this {
		this.handler = handler;
		this.failure = undefined;
		return this;
	}

	public get calls(): readonly FakeToolCall[] {
		return this.received;
	}

	public get callCount(): number {
		return this.received.length;
	}

	public lastArgs(): Readonly<Record<string, unknown>> | undefined {
		return this.received.at(-1)?.args;
	}

	public execute(input: unknown, context: ToolContext): unknown {
		const args = typeof input === "object" && input !== null ? Object(input) : {};
		this.received.push({ args });
		if (this.failure !== undefined) throw this.failure;
		return this.handler === undefined ? this.answer : this.handler(args, context);
	}
}
