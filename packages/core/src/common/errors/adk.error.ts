/**
 * Base of the entire error taxonomy for the lib.
 * Errors throw from the public verbs and iterators; they never become events.
 */
export abstract class AdkError extends Error {
	/** Stable code for catch and telemetry, independent of the message. */
	public abstract readonly code: string;

	public constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = new.target.name;
	}
}
