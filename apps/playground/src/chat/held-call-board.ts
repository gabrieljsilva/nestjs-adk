import { type RunContext, ToolCallNotice, ToolCallObserver, type ToolResultNotice } from "@nestjs-adk/core";

export class HeldCall {
	public constructor(
		public readonly callId: string,
		public readonly toolName: string,
		public readonly effect: string,
		public readonly args: Readonly<Record<string, unknown>>,
	) {}

	public static of(notice: ToolCallNotice): HeldCall {
		return new HeldCall(notice.callId.value, notice.toolName, notice.effect?.name ?? "unknown", notice.args);
	}

	public get question(): string {
		return `Approve ${this.toolName} (${this.effect}) with ${JSON.stringify(this.args)}?`;
	}
}

export class HeldCallBoard extends ToolCallObserver {
	private readonly held = new Map<string, HeldCall>();
	private readonly closed: string[] = [];

	public get awaiting(): readonly HeldCall[] {
		return [...this.held.values()];
	}

	public get settledCalls(): readonly string[] {
		return this.closed;
	}

	public requested(_context: RunContext, call: ToolCallNotice): void {
		if (!call.isHeld) return;
		this.held.set(call.callId.value, HeldCall.of(call));
	}

	public settled(_context: RunContext, result: ToolResultNotice): void {
		this.held.delete(result.callId.value);
		this.closed.push(result.toolName);
	}
}
