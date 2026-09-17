export class JsonPointer {
	private constructor(public readonly segments: readonly string[]) {}

	public static fromText(text: string): JsonPointer | undefined {
		if (text.length === 0) return new JsonPointer([]);
		if (!text.startsWith("/")) return undefined;
		return new JsonPointer(text.slice(1).split("/").map(unescapeSegment));
	}

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

function unescapeSegment(segment: string): string {
	return segment.replaceAll("~1", "/").replaceAll("~0", "~");
}

function escapeSegment(segment: string): string {
	return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

function readIndex(segment: string): number | undefined {
	if (!/^(0|[1-9]\d*)$/.test(segment)) return undefined;
	return Number(segment);
}
