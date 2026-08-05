/**
 * How much a model can read in one call, and how much is held back for the answer.
 *
 * A window the provider never declared is a case of its own rather than a missing
 * value: it answers `isKnown` false, accepts any size and lets the runtime degrade out
 * loud, because a default number here would silently truncate someone's conversation.
 */
export abstract class ContextWindow {
	public abstract readonly isKnown: boolean;

	/** Held back before any input is accepted; zero when the window is unknown. */
	public abstract readonly reservedOutputTokens: number;

	/** Room left for input once the output is set aside; unbounded when the window is unknown. */
	public abstract readonly inputCapacity: number;

	public abstract fits(inputTokens: number): boolean;
}
