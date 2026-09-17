import type { BilledCall } from "../../../domain/cost/billed-call.value-object";
import type { SessionState } from "../../../domain/session/state/session-state.value-object";

export class RunProgress {
	private text = "";
	private structured?: unknown;
	private waiting = false;
	private readonly calls: BilledCall[] = [];

	public constructor(private current: SessionState) {}

	public get state(): SessionState {
		return this.current;
	}

	public get answer(): string {
		return this.text;
	}

	public advanced(state: SessionState): void {
		this.current = state;
	}

	public said(text: string): void {
		this.text = text;
	}

	public answered(output: unknown): void {
		this.structured = output;
	}

	public get output(): unknown {
		return this.structured;
	}

	public charged(...calls: readonly BilledCall[]): void {
		this.calls.push(...calls);
	}

	public get billed(): readonly BilledCall[] {
		return this.calls;
	}

	public suspend(): void {
		this.waiting = true;
	}

	public get isSuspended(): boolean {
		return this.waiting;
	}
}
