import { Secret } from "../../common/secrecy/secret.value-object";
import { EventRedactor } from "./event-redactor.contract";

const REDACTED_MASK = "[redacted]";

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

const MAX_REDACTION_DEPTH = 8;

/**
 * The redactor a runtime uses unless the application replaces it. It masks a closed list of
 * credential field names, case insensitively, and anything wrapped in `Secret` by type.
 *
 * The constructor takes further names to redact, for a payload whose field is `x-api-token`
 * or `senha`. A payload shaped `{ key, value }` is judged by what `key` holds.
 */
export class FieldNameEventRedactor extends EventRedactor {
	private readonly names: ReadonlySet<string>;

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
			redacted[key] = this.isRedacted(key) || (named && key === "value") ? REDACTED_MASK : this.value(value, depth + 1);
		}
		return redacted;
	}

	private namesItsOwnValue(payload: Readonly<Record<string, unknown>>): boolean {
		const key = payload.key;
		return "value" in payload && typeof key === "string" && this.isRedacted(key);
	}

	private isRedacted(name: string): boolean {
		return this.names.has(name.toLowerCase());
	}

	private value(value: unknown, depth: number): unknown {
		if (value instanceof Secret) return REDACTED_MASK;
		if (depth >= MAX_REDACTION_DEPTH) return REDACTED_MASK;
		if (Array.isArray(value)) return value.map((item) => this.value(item, depth + 1));
		if (this.isRecord(value)) return this.record(value, depth);
		return value;
	}

	private isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
	}
}
