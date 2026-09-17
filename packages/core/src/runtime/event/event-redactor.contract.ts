/**
 * Removes credentials from a payload before anyone outside the runtime reads it.
 *
 * It is a port, so an application whose payloads carry a secret under a shape nothing here
 * anticipates writes one and plugs it into `RuntimeOptions.redactor`. What ships is
 * {@link FieldNameEventRedactor}, and extending that one with extra field names is the
 * smaller answer.
 *
 * Whatever the rule, it preserves structure: a consumer still sees that the field was
 * there, which is what makes an audit trail readable.
 */
export abstract class EventRedactor {
	public abstract redact(payload: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>;
}
