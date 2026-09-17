/** How many entries of an object or an array are named before the rest is counted instead. */
const MAX_ENTRIES = 40;

/**
 * The shape of a JSON value, written small enough to read instead of the value.
 *
 * What a model needs before it asks for a value is what is in there and where: the keys of
 * an object, the length of an array, the type behind each name. Everything else is the
 * content, and the content is the thing that did not fit. So an outline names types and
 * counts and never a value, which is also what keeps it bounded: the size of an outline
 * follows the shape of the document rather than how much is in it.
 *
 * Depth is where it stops. Below the last level a container says what it is and how many
 * entries it holds, which is exactly enough for the model to point a pointer one level
 * deeper and ask again.
 */
export class JsonOutline {
	public build(value: unknown, depth: number): unknown {
		if (Array.isArray(value)) return this.buildArray(value, depth);
		if (value !== null && typeof value === "object") return this.buildObject(value as Record<string, unknown>, depth);
		return describeLeaf(value);
	}

	private buildArray(value: readonly unknown[], depth: number): unknown {
		if (depth <= 0) return `array(${value.length} items)`;
		const items = value.slice(0, MAX_ENTRIES).map((item) => this.build(item, depth - 1));
		return { type: "array", length: value.length, items, omittedItems: Math.max(0, value.length - MAX_ENTRIES) };
	}

	private buildObject(value: Record<string, unknown>, depth: number): unknown {
		const keys = Object.keys(value);
		if (depth <= 0) return `object(${keys.length} keys)`;
		const properties: Record<string, unknown> = {};
		for (const key of keys.slice(0, MAX_ENTRIES)) properties[key] = this.build(value[key], depth - 1);
		return { type: "object", keys: keys.length, properties, omittedKeys: Math.max(0, keys.length - MAX_ENTRIES) };
	}
}

/** A value with nothing inside it says what it is, and a string says how long it is. */
function describeLeaf(value: unknown): string {
	if (value === null) return "null";
	if (typeof value === "string") return `string(${value.length} characters)`;
	return typeof value;
}
