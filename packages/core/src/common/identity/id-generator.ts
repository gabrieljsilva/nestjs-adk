/**
 * Source of fresh identity text for the runtime.
 * Callers wrap the result in the identity class they need, so the generator stays
 * unaware of which concept it is naming.
 */
export abstract class IdGenerator {
	public abstract next(): string;
}
