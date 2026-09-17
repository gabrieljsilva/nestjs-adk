/**
 * When a result is too large to sit in the context, and when it is nobody's problem.
 *
 * It is a port, so an application that decides by media type, by tool or by tenant writes
 * one and plugs it into `RuntimeOptions.offload`. What ships is
 * {@link CharacterCountOffloadPolicy}, which decides on one number.
 *
 * Whatever the rule, it is answered before the call, which is why the question is about
 * characters rather than tokens: tokens are a number the provider reports afterwards, and a
 * decision that has to be taken before the call cannot wait for one.
 */
export abstract class OffloadPolicy {
	public abstract shouldOffload(characters: number): boolean;

	/** Whether anything at all is moved out, which is what a report about the runtime reads. */
	public abstract get isEnabled(): boolean;

	/** The size a result has to pass to be moved out, when the policy decides on one. */
	public abstract get thresholdCharacters(): number | undefined;
}
