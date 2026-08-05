import { Secret } from "../../common/secrecy/secret";

/** What a redacted value becomes, whatever it was. */
const MASK = "[redacted]";

/**
 * Field names that carry a credential often enough to be redacted on sight.
 *
 * The list is closed on purpose. A pattern like "anything containing key" would redact
 * `keyword` and `monkeys`, and a consumer that receives a masked field it needed has no
 * way to tell a bug from a policy. Anything outside the list travels wrapped in
 * `Secret`, which is redacted by type rather than by name.
 */
const REDACTED_FIELDS: ReadonlySet<string> = new Set([
	"apikey",
	"authorization",
	"cookie",
	"set-cookie",
	"token",
	"refreshtoken",
	"password",
	"secret",
]);

/** Anything deeper than this is a payload that lost its shape, and is dropped rather than walked. */
const MAX_DEPTH = 8;

/**
 * Removes credentials from a payload before anyone outside the runtime reads it.
 *
 * Two rules, and they cover different things. By name, for the fields a tool or a
 * provider conventionally uses; by type, for anything wrapped in `Secret`, which works
 * under a name nobody anticipated. Structure is preserved either way: a consumer still
 * sees that the field was there, which is what makes an audit trail readable.
 */
export class EventRedactor {
	public redact(payload: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
		return this.record(payload, 0);
	}

	private record(payload: Readonly<Record<string, unknown>>, depth: number): Record<string, unknown> {
		const redacted: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(payload)) {
			redacted[key] = REDACTED_FIELDS.has(key.toLowerCase()) ? MASK : this.value(value, depth + 1);
		}
		return redacted;
	}

	private value(value: unknown, depth: number): unknown {
		if (value instanceof Secret) return MASK;
		if (depth >= MAX_DEPTH) return MASK;
		if (Array.isArray(value)) return value.map((item) => this.value(item, depth + 1));
		if (this.isRecord(value)) return this.record(value, depth);
		return value;
	}

	private isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
	}
}
