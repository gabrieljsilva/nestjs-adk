export class CanonicalJson {
	public static stringify(value: unknown): string {
		return JSON.stringify(CanonicalJson.normalize(value));
	}

	private static normalize(value: unknown): unknown {
		if (Array.isArray(value)) return value.map((item) => CanonicalJson.normalize(item));
		if (value === null || typeof value !== "object") return value;
		const entries: Array<[string, unknown]> = [];
		for (const key of Object.keys(value).sort()) {
			const property = Reflect.get(value, key);
			if (property === undefined) continue;
			entries.push([key, CanonicalJson.normalize(property)]);
		}
		return Object.fromEntries(entries);
	}
}
