import { AdkTool, type ToolContext, ToolMetadata } from "@nestjs-adk/core";

/** One call the double answered, with what the model chose. */
export interface FakeToolCall {
	readonly args: Readonly<Record<string, unknown>>;
}

/**
 * A tool that answers what the test says instead of doing the work.
 *
 * It is built from the class it replaces, so the name the model calls, the description it
 * reads and the schema that parses the input all come from the real decorator: the double
 * cannot drift from the contract it stands for, because it never restates it.
 *
 * Substituting is for changing behaviour, not for watching it. What the real tool received
 * is already in the run's events, so a test that only wants to assert arguments does not
 * need a double at all.
 */
export class ToolFake extends AdkTool {
	private readonly received: FakeToolCall[] = [];
	private answer: unknown = {};
	private failure?: Error;
	private handler?: (args: Record<string, unknown>, context: ToolContext) => unknown;

	private constructor(public readonly toolName: string) {
		super();
	}

	/** A double for one tool class, carrying the name that class declared. */
	public static replacing(type: unknown): ToolFake {
		return new ToolFake(ToolMetadata.findOrFail(type).name);
	}

	public succeedsWith(result: unknown): this {
		this.answer = result;
		this.failure = undefined;
		this.handler = undefined;
		return this;
	}

	/** Fails the way a tool fails: the run carries the failure to the model as a result. */
	public failsWith(error: Error): this {
		this.failure = error;
		this.handler = undefined;
		return this;
	}

	/** Answers from the input, for a case where a constant would not be an answer. */
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

	/** What the last call carried, which is the assertion most tests are after. */
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
