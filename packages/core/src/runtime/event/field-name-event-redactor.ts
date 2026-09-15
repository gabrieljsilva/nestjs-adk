import { Secret } from "../../common/secrecy/secret";
import { EventRedactor } from "./event-redactor";

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
 * Redacts by field name, and by type for anything wrapped in `Secret`.
 *
 * Two rules, and they cover different things. By name, for the fields a tool or a
 * provider conventionally uses; by type, for anything wrapped in `Secret`, which works
 * under a name nobody anticipated.
 *
 * A payload that carries a name and its value as two fields is covered by the same list.
 * Session metadata is written that way, so the name a key was given sits in `key` rather
 * than in the position a field name occupies, and a rule that only looked at field names
 * would publish a credential stored under `token` while masking a field called `token`.
 */
export class FieldNameEventRedactor extends EventRedactor {
	private readonly names: ReadonlySet<string>;

	/**
	 * The shipped list, plus whatever else this application calls a credential.
	 *
	 * An extra name is how a payload whose field is `x-api-token` or `senha` gets covered
	 * without the closed list growing a pattern. Case is not significant, since a provider
	 * writes `Authorization` and a tool writes `authorization`.
	 */
	public constructor(alsoRedacted: readonly string[] = []) {
		super();
		this.names = new Set([...REDACTED_FIELDS, ...alsoRedacted.map((name) => name.toLowerCase())]);
	}

	public redact(payload: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
		return this.record(payload, 0);
	}

	private record(payload: Readonly<Record<string, unknown>>, depth: number): Record<string, unknown> {
		const named = this.namesItsOwnValue(payload);
		const redacted: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(payload)) {
			redacted[key] = this.isRedacted(key) || (named && key === "value") ? MASK : this.value(value, depth + 1);
		}
		return redacted;
	}

	/** A payload of the shape `{ key, value }`, where the name to judge is what `key` holds. */
	private namesItsOwnValue(payload: Readonly<Record<string, unknown>>): boolean {
		const key = payload.key;
		return "value" in payload && typeof key === "string" && this.isRedacted(key);
	}

	private isRedacted(name: string): boolean {
		return this.names.has(name.toLowerCase());
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
