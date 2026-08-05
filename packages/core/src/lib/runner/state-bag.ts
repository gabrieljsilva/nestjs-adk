import { AgentStateInvalidError, AgentStateMissingError } from "../errors";
import type { AnyZodObject } from "../types/options";
import type { StateBag } from "../types/tool-context";

export interface StateGuard {
	/** Agent's declared state schema: validates declared keys; undeclared keys pass through. */
	schema?: AnyZodObject;
	/** Agent name for error messages. */
	agent?: string;
}

/** StateBag that tracks mutations as a delta (becomes the session's stateDelta at the end of the run). */
export class DeltaStateBag implements StateBag {
	private readonly changes = new Map<string, unknown>();

	public constructor(
		private readonly initial: Record<string, unknown>,
		private readonly guard: StateGuard = {},
	) {
		// Entry validation (ask() state + store hydration): declared keys present must match, types
		// only; presence is enforced lazily by require(), so partial states stay valid at the boundary.
		const schema = guard.schema;
		if (!schema) return;
		for (const key of Object.keys(schema.shape)) {
			if (initial[key] !== undefined) this.validate(key, initial[key]);
		}
	}

	public get<T = unknown>(key: string): T | undefined {
		if (this.changes.has(key)) return this.changes.get(key) as T;
		return this.initial[key] as T | undefined;
	}

	public set(key: string, value: unknown): void {
		this.validate(key, value);
		this.changes.set(key, value);
	}

	public require<T = unknown>(key: string): T {
		const value = this.get<T>(key);
		if (value === undefined) throw new AgentStateMissingError(this.guard.agent ?? "unknown", key);
		return value;
	}

	public delta(): Record<string, unknown> {
		return Object.fromEntries(this.changes);
	}

	/** Everything the bag can see right now: what a paused action has to be resumed with. */
	public snapshot(): Record<string, unknown> {
		return { ...this.initial, ...Object.fromEntries(this.changes) };
	}

	private validate(key: string, value: unknown): void {
		const shape = this.guard.schema?.shape;
		// Object.hasOwn: keys like "constructor"/"__proto__" must not resolve through the prototype chain.
		if (!shape || !Object.hasOwn(shape, key)) return;
		// Minimal parse contract: zod v3 and v4 type the shape values differently (peer range covers both).
		const field = shape[key] as unknown as {
			safeParse(input: unknown): { success: boolean; error?: { issues: unknown } };
		};
		const result = field.safeParse(value);
		if (!result.success) {
			throw new AgentStateInvalidError(this.guard.agent ?? "unknown", result.error?.issues, key);
		}
	}
}
