import type { ContextSnapshot } from "../../domain/diagnostics/context-snapshot";
import { ContextCapture } from "./context-capture";

/**
 * The snapshots one run produced, in the order it produced them.
 * It belongs to one run and never outlives it, which is what keeps two concurrent
 * commands from mixing their contexts and what makes the buffer bounded by the run.
 */
export class CapturedContexts extends ContextCapture {
	private readonly snapshots: ContextSnapshot[] = [];

	public capture(snapshot: ContextSnapshot): void {
		this.snapshots.push(snapshot);
	}

	public get all(): readonly ContextSnapshot[] {
		return [...this.snapshots];
	}

	public get size(): number {
		return this.snapshots.length;
	}
}
