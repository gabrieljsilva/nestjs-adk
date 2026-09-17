const MAX_ENTRIES = 40;

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

function describeLeaf(value: unknown): string {
	if (value === null) return "null";
	if (typeof value === "string") return `string(${value.length} characters)`;
	return typeof value;
}
