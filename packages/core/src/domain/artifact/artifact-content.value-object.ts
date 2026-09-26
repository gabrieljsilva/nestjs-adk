import type { ContentDigest } from "../../common/digest/content-digest.value-object";
import { TextDigest } from "../../common/digest/text-digest.service";
import { ArtifactEncoding } from "./artifact-encoding.value-object";
import type { ArtifactName } from "./artifact-name.value-object";

const DEFAULT_MEDIA_TYPE = "text/plain";
const DEFAULT_BYTES_MEDIA_TYPE = "application/octet-stream";

/**
 * The content of an artifact: text the model can read through the artifact tools, or bytes it
 * cannot, plus what it is and what it is called.
 *
 * The constructor takes text; `fromBytes` takes bytes and keeps them as base64. `isText` is
 * the fact every tool asks first. The media type is normalized to lower case and defaults to
 * `text/plain` for text and `application/octet-stream` for bytes; the digest covers the exact
 * stored representation, so a store that keeps what it was given always matches.
 */
export class ArtifactContent {
	public readonly mediaType: string;

	private constructor(
		public readonly text: string,
		mediaType: string,
		public readonly encoding: ArtifactEncoding,
		public readonly name?: ArtifactName,
	) {
		const normalized = mediaType.trim().toLowerCase();
		const fallback = encoding.isText ? DEFAULT_MEDIA_TYPE : DEFAULT_BYTES_MEDIA_TYPE;
		this.mediaType = normalized.length === 0 ? fallback : normalized;
	}

	public static fromText(text: string, mediaType: string = DEFAULT_MEDIA_TYPE, name?: ArtifactName): ArtifactContent {
		return new ArtifactContent(text, mediaType, ArtifactEncoding.TEXT, name);
	}

	public static fromBytes(
		bytes: Uint8Array,
		mediaType: string = DEFAULT_BYTES_MEDIA_TYPE,
		name?: ArtifactName,
	): ArtifactContent {
		return new ArtifactContent(Buffer.from(bytes).toString("base64"), mediaType, ArtifactEncoding.BASE64, name);
	}

	public static fromBase64(base64: string, mediaType: string, name?: ArtifactName): ArtifactContent {
		return new ArtifactContent(base64, mediaType, ArtifactEncoding.BASE64, name);
	}

	public static restore(
		stored: string,
		mediaType: string,
		encoding: ArtifactEncoding,
		name?: ArtifactName,
	): ArtifactContent {
		return new ArtifactContent(stored, mediaType, encoding, name);
	}

	public get isText(): boolean {
		return this.encoding.isText;
	}

	public get characters(): number {
		return this.isText ? this.text.length : 0;
	}

	public get bytes(): number {
		if (this.isText) return Buffer.byteLength(this.text, "utf8");
		return Buffer.from(this.text, "base64").length;
	}

	public get base64(): string {
		return this.isText ? Buffer.from(this.text, "utf8").toString("base64") : this.text;
	}

	public digest(): ContentDigest {
		return TextDigest.fromText(this.text);
	}
}
