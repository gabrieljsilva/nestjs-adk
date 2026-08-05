import { type ModelPart, isTextMimeType, normalizeMimeType } from "@nestjs-adk/core";

/** What Gemini can actually look at. Anything else is bytes it would read as gibberish. */
const INLINE_PREFIXES = ["image/", "audio/", "video/"];
const INLINE_TYPES = new Set(["application/pdf"]);

type GenaiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

function isViewable(mimeType: string): boolean {
	return INLINE_PREFIXES.some((prefix) => mimeType.startsWith(prefix)) || INLINE_TYPES.has(mimeType);
}

/**
 * Neutral part → genai part, routed by what the provider can do with it. Three destinations:
 * viewable formats go inline as bytes, text-like formats are decoded to characters, and anything
 * else is described. A spreadsheet is the honest example of the third case: XLSX is a zip, so no
 * model reads it, saying so beats spending thousands of tokens on base64 the model cannot use.
 */
export function toGenaiPart(part: ModelPart): GenaiPart {
	if ("text" in part) return { text: part.text };
	if (!("data" in part)) return { text: "" };

	const mimeType = normalizeMimeType(part.data.mimeType) || "application/octet-stream";
	if (isViewable(mimeType)) return { inlineData: { mimeType, data: part.data.base64 } };

	const decoded = Buffer.from(part.data.base64, "base64");
	if (isTextMimeType(mimeType)) return { text: decoded.toString("utf8") };

	const sizeKb = (decoded.length / 1024).toFixed(1);
	return { text: `[Attachment of type ${mimeType}, ${sizeKb} KB: this format cannot be displayed inline.]` };
}
