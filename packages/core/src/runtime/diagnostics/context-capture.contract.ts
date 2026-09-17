import type { ContextSnapshot } from "../../domain/diagnostics/context-snapshot.value-object";

export abstract class ContextCapture {
	public abstract capture(snapshot: ContextSnapshot): void;
}
