import type { ToolCallDelta } from "../../domain/model/tool-call-delta";

/**
 * A tool call while it is still arriving.
 *
 * Providers disagree about how a call is streamed: some send the whole thing at once,
 * others open it with an id and a name and then trickle the arguments as fragments of
 * JSON. This accumulates either shape and stays immutable, so an aggregator holds a
 * value rather than a buffer someone else could still be writing to.
 */
export class PartialToolCall {
	public constructor(
		public readonly argumentsText: string = "",
		public readonly callId?: string,
		public readonly toolName?: string,
		public readonly signature?: string,
	) {}

	public with(delta: ToolCallDelta): PartialToolCall {
		return new PartialToolCall(
			`${this.argumentsText}${delta.argumentsDelta}`,
			delta.callId ?? this.callId,
			delta.toolName ?? this.toolName,
			delta.signature ?? this.signature,
		);
	}

	/** The arguments as an object, or nothing when what arrived is not one. */
	public parseArguments(): Record<string, unknown> | undefined {
		const text = this.argumentsText.trim();
		if (text.length === 0) return {};
		const parsed: unknown = this.parse(text);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
		const args: Record<string, unknown> = {};
		for (const key of Object.keys(parsed)) args[key] = Reflect.get(parsed, key);
		return args;
	}

	private parse(text: string): unknown {
		try {
			return JSON.parse(text);
		} catch {
			return undefined;
		}
	}
}
