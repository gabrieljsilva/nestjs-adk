/**
 * How much a model can read in one call, and how much is held back for the answer.
 * A window the provider never declared answers `isKnown` false and accepts any size,
 * instead of defaulting to a number that would silently truncate a conversation.
 */
export abstract class ContextWindow {
	public abstract readonly isKnown: boolean;

	public abstract readonly reservedOutputTokens: number;

	public abstract readonly inputCapacity: number;

	public abstract fits(inputTokens: number): boolean;
}
