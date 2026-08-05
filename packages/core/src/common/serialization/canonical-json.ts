/**
 * Renders a value to the one text that represents it.
 *
 * Object keys are ordered, `undefined` is omitted rather than written as null, and
 * nothing about insertion order can leak in. Anything measured or fingerprinted goes
 * through here first, so the same content always produces the same bytes.
 */
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
