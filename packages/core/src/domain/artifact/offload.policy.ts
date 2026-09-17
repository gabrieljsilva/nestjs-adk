import { OffloadDecision } from "./offload-decision.value-object";

/**
 * What becomes of a result: whether it is too large to sit in the context, and what the
 * model is still able to do with it once it is not there.
 *
 * It is a port, so an application that decides by media type, by tool or by tenant writes
 * one and plugs it into `RuntimeOptions.context.offload`. What ships is
 * {@link CharacterCountOffloadPolicy}, which decides on one number and one media type.
 *
 * `decide` is the whole of the contract, and `shouldOffload` is read off it, because two
 * methods answering the same question is two answers to disagree about. A policy that only
 * ever moves content out opaquely still implements one method.
 *
 * Whatever the rule, it is answered before the call, which is why the question is about
 * characters rather than tokens: tokens are a number the provider reports afterwards, and a
 * decision that has to be taken before the call cannot wait for one.
 */
export abstract class OffloadPolicy {
	/**
	 * Inline, opaque or explorable, from how long the content is and what it claims to be.
	 *
	 * The media type is absent when nothing declared one, and a policy that needs it treats
	 * that as the least it can assume rather than as text.
	 */
	public abstract decide(characters: number, mediaType?: string): OffloadDecision;

	/** Whether anything at all is moved out, which is what a report about the runtime reads. */
	public abstract get isEnabled(): boolean;

	/** The size a result has to pass to be moved out, when the policy decides on one. */
	public abstract get thresholdCharacters(): number | undefined;

	/** Whether this content leaves the context, whichever of the two ways it leaves it by. */
	public shouldOffload(characters: number, mediaType?: string): boolean {
		return !this.decide(characters, mediaType).isInline;
	}
}
