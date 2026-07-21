import type { StateBag } from "../types/tool-context";

/** StateBag that tracks mutations as a delta (becomes the session's stateDelta at the end of the run). */
export class DeltaStateBag implements StateBag {
	private readonly changes = new Map<string, unknown>();

	public constructor(private readonly initial: Record<string, unknown>) {}

	public get<T = unknown>(key: string): T | undefined {
		if (this.changes.has(key)) return this.changes.get(key) as T;
		return this.initial[key] as T | undefined;
	}

	public set(key: string, value: unknown): void {
		this.changes.set(key, value);
	}

	public delta(): Record<string, unknown> {
		return Object.fromEntries(this.changes);
	}
}
