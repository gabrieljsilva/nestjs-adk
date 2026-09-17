/**
 * One address into a JSON document, exactly as RFC 6901 writes it.
 *
 * It is the whole of the query language on purpose. JSONPath has filters, unions and, in
 * most implementations, an expression evaluator, and an expression evaluator reached by a
 * string a model wrote is code execution with extra steps. A pointer walks: it is a list of
 * names and indices, it cannot branch, it cannot match and it cannot compute, so the worst
 * a hostile one does is miss.
 *
 * `""` is the whole document, `/orders/0/total` is one number, `~1` is a literal `/` and
 * `~0` a literal `~`. A pointer that does not start with `/` and is not empty is not a
 * pointer, and is refused rather than interpreted.
 */
export class JsonPointer {
	private constructor(public readonly segments: readonly string[]) {}

	/** The pointer, or nothing when the text is not one. */
	public static fromText(text: string): JsonPointer | undefined {
		if (text.length === 0) return new JsonPointer([]);
		if (!text.startsWith("/")) return undefined;
		return new JsonPointer(text.slice(1).split("/").map(unescapeSegment));
	}

	/** The value at this address, or nothing when the document has none there. */
	public resolve(document: unknown): unknown {
		let current = document;
		for (const segment of this.segments) {
			if (Array.isArray(current)) {
				const index = readIndex(segment);
				if (index === undefined || index >= current.length) return undefined;
				current = current[index];
				continue;
			}
			if (current === null || typeof current !== "object") return undefined;
			if (!Object.hasOwn(current, segment)) return undefined;
			current = (current as Record<string, unknown>)[segment];
		}
		return current;
	}

	public toString(): string {
		return this.segments.map((segment) => `/${escapeSegment(segment)}`).join("");
	}
}

/** `~1` before `~0`, which is the order the RFC gives and the one that round trips. */
function unescapeSegment(segment: string): string {
	return segment.replaceAll("~1", "/").replaceAll("~0", "~");
}

function escapeSegment(segment: string): string {
	return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

/** An array index is decimal digits and nothing else: `01` and `1.0` address nothing. */
function readIndex(segment: string): number | undefined {
	if (!/^(0|[1-9]\d*)$/.test(segment)) return undefined;
	return Number(segment);
}
