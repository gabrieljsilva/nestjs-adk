import { NonStrictJsonSchemaError } from "./errors/non-strict-json-schema.error";

/** Where a nested schema hides: named maps of schemas, and lists of alternatives. */
const NAMED_GROUPS = ["properties", "$defs", "definitions"];
const BRANCH_GROUPS = ["anyOf", "oneOf", "allOf"];

/**
 * Checks a structured output schema against the subset strict mode accepts.
 *
 * OpenAI enforces a schema only in strict mode, and strict mode has rules: every object
 * closed with `additionalProperties: false`, and every property it declares listed in
 * `required`. Outside them the answer is a 400 naming a field, which reaches the caller
 * as a failed run rather than as the mistake it is.
 *
 * Two things make that worth catching here. A schema is written once and sent on every
 * call, so a wrong one fails forever rather than intermittently. And nothing else
 * checks it: the default validator in the core reads the answer as JSON without a
 * schema language, so dropping strict quietly would trade a loud 400 for a shape
 * nobody verifies.
 *
 * Only the two rules above are checked. They cover what a schema converted from a
 * declaration hits, and inventing a full strict mode validator here would fail requests
 * over rules only the provider is authoritative about.
 */
export class StrictSchemaValidator {
	/** Throws on the first thing strict mode would reject, naming where it sits. */
	public validate(schema: object): void {
		const pending: [string, object][] = [["", schema]];
		while (pending.length > 0) {
			const next = pending.pop();
			if (next === undefined) break;
			const [path, node] = next;
			if (this.describesObject(node)) this.verifyClosed(node, path);
			pending.push(...this.childrenOf(node, path));
		}
	}

	/** A schema with properties describes an object whether or not it says the word. */
	private describesObject(node: object): boolean {
		return this.recordAt(node, "properties") !== undefined || Reflect.get(node, "type") === "object";
	}

	private verifyClosed(node: object, path: string): void {
		if (Reflect.get(node, "additionalProperties") !== false) {
			throw new NonStrictJsonSchemaError(path, 'does not set "additionalProperties" to false');
		}
		const required = Reflect.get(node, "required");
		const listed = new Set(Array.isArray(required) ? required.filter((name) => typeof name === "string") : []);
		for (const key of Object.keys(this.recordAt(node, "properties") ?? {})) {
			if (!listed.has(key)) throw new NonStrictJsonSchemaError(path, `leaves "${key}" out of "required"`);
		}
	}

	private childrenOf(node: object, path: string): [string, object][] {
		const children: [string, object][] = [];
		for (const group of NAMED_GROUPS) {
			const map = this.recordAt(node, group);
			if (map === undefined) continue;
			for (const key of Object.keys(map)) {
				const child = Reflect.get(map, key);
				if (this.isRecord(child)) children.push([this.join(path, `${group}.${key}`), child]);
			}
		}
		for (const group of BRANCH_GROUPS) {
			const list = Reflect.get(node, group);
			if (!Array.isArray(list)) continue;
			for (let index = 0; index < list.length; index += 1) {
				const child: unknown = list[index];
				if (this.isRecord(child)) children.push([this.join(path, `${group}[${index}]`), child]);
			}
		}
		const items = Reflect.get(node, "items");
		if (this.isRecord(items)) children.push([this.join(path, "items"), items]);
		return children;
	}

	private recordAt(node: object, key: string): object | undefined {
		const value = Reflect.get(node, key);
		return this.isRecord(value) ? value : undefined;
	}

	private isRecord(value: unknown): value is object {
		return typeof value === "object" && value !== null && !Array.isArray(value);
	}

	private join(path: string, step: string): string {
		return path === "" ? step : `${path}.${step}`;
	}
}
