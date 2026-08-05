import type { ContextSnapshot } from "../../domain/diagnostics/context-snapshot";

/**
 * Where a run puts a photograph of every context it sent.
 *
 * It is a dependency handed to the run, never a static somebody looks up. Two application
 * contexts in one process therefore capture into two different places, and a run nobody
 * asked to observe captures nothing at all rather than into a buffer that grows forever.
 */
export abstract class ContextCapture {
	public abstract capture(snapshot: ContextSnapshot): void;
}
