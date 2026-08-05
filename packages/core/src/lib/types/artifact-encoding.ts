import type { ArtifactPart } from "./events";

/**
 * Structured formats that are still just characters; base64ing them would help nobody. Shared so the
 * two decisions that depend on it (how to decode a stored artifact, and whether a model can read a
 * part as text) never drift into disagreeing about the same mime type.
 */
export const TEXT_MIME_TYPES: ReadonlySet<string> = new Set([
	"application/json",
	"application/xml",
	"application/csv",
	"application/x-ndjson",
	"application/yaml",
	"application/x-yaml",
]);

/** `text/csv; charset=utf-8` → `text/csv`. */
export function normalizeMimeType(mimeType: string): string {
	const [prefix] = mimeType.split(";");
	return (prefix ?? mimeType).trim().toLowerCase();
}

/** True when the bytes are characters a model can simply read. */
export function isTextMimeType(mimeType: string): boolean {
	const normalized = normalizeMimeType(mimeType);
	return normalized.startsWith("text/") || TEXT_MIME_TYPES.has(normalized);
}

/**
 * How to read {@link ArtifactPart.data}. An explicit `encoding` always wins; without one the
 * mimeType decides, because artifacts reach the store from two directions: offloaded tool results
 * are JSON text, uploaded files are base64, and guessing wrong turns an image into mojibake or a
 * JSON document into a meaningless byte count.
 */
export function artifactEncoding(part: ArtifactPart): "utf8" | "base64" {
	if (part.encoding) return part.encoding;
	return isTextMimeType(part.mimeType) ? "utf8" : "base64";
}
