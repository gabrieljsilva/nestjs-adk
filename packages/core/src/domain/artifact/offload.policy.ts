import { OffloadDecision } from "./offload-decision.value-object";

/**
 * Decides whether a result is too large to sit in the context, and what the model can still do
 * with it once it is not there. Plugged in through `RuntimeOptions.context.offload`.
 *
 * The question is asked before the call, which is why it is about characters and not tokens: a
 * token count is something the provider reports afterwards.
 */
export abstract class OffloadPolicy {
	public abstract decide(characters: number, mediaType?: string): OffloadDecision;

	public abstract get isEnabled(): boolean;

	public abstract get thresholdCharacters(): number | undefined;

	public shouldOffload(characters: number, mediaType?: string): boolean {
		return !this.decide(characters, mediaType).isInline;
	}
}
