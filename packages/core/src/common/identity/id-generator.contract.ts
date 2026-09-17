/** Source of fresh identity text. Every id the runtime mints comes from here. */
export abstract class IdGenerator {
	public abstract next(): string;
}
