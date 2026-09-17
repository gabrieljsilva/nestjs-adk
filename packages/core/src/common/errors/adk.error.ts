/**
 * Base of every error this lib throws. They surface from the public verbs and iterators
 * and never become events.
 */
export abstract class AdkError extends Error {
	public abstract readonly code: string;

	public constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = new.target.name;
	}
}
