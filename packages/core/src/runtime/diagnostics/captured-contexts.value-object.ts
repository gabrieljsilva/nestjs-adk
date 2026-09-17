import type { ContextSnapshot } from "../../domain/diagnostics/context-snapshot.value-object";
import { ContextCapture } from "./context-capture.contract";

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
