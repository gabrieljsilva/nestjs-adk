export abstract class EventRedactor {
	public abstract redact(payload: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>;
}
