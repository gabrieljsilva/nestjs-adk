import type { ToolCallDelta } from "../../domain/model/streaming/tool-call-delta.value-object";

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
