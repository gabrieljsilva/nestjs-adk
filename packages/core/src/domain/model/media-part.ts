import { MalformedMediaError } from "./errors/malformed-media.error";
import { MediaTooLargeError } from "./errors/media-too-large.error";
import { UnsupportedMediaTypeError } from "./errors/unsupported-media-type.error";
import { MediaLimits } from "./media-limits";
import { ProjectedMediaCost } from "./projected-media-cost";

const DATA_URL_PREFIX = "data:";
const BASE64_MARKER = ";base64";
const PADDING = "=";

/**
 * Something the model looks at rather than reads: an image, and nothing else for now.
 *
 * The bytes travel base64 encoded because that is what every provider accepts and what a
 * JSON journal can hold. What arrives is validated here and not at the call: an
 * unsupported type, base64 that does not decode or an image over the limit all end the
 * same way at the provider, which is a rejected request that was already paid for.
 *
 * A data URL is accepted as readily as raw base64, because that is the shape a browser
 * hands over. When both say what the image is, they have to agree.
 *
 * It is deliberately not a union of every modality. Audio and video are different problems
 * with different limits, and a type that claims to carry them before anything does would
 * be a promise nobody kept.
 */
export class MediaPart {
	private constructor(
		public readonly mediaType: string,
		public readonly base64: string,
	) {}

	public static image(mediaType: string, base64: string, limits: MediaLimits = MediaLimits.byDefault()): MediaPart {
		const declared = mediaType.trim().toLowerCase();
		const data = base64.trim();
		const url = MediaPart.dataUrlOf(data);
		const type = url === undefined ? declared : MediaPart.agreedTypeOf(declared, url.mediaType);
		const encoded = url === undefined ? data : url.base64;

		if (!limits.supports(type)) throw new UnsupportedMediaTypeError(type, limits.supportedTypes);
		if (!MediaPart.isCanonicalBase64(encoded)) throw new MalformedMediaError("the content is not canonical base64");

		const part = new MediaPart(type, encoded);
		if (part.encodedBytes > limits.maxEncodedBytes) {
			throw new MediaTooLargeError("encoded", part.encodedBytes, limits.maxEncodedBytes);
		}
		if (part.decodedBytes > limits.maxDecodedBytes) {
			throw new MediaTooLargeError("decoded", part.decodedBytes, limits.maxDecodedBytes);
		}
		return part;
	}

	/** What the request carries for this attachment, which is the encoding and not the image. */
	public get encodedBytes(): number {
		return this.base64.length;
	}

	/** The size of the image itself, derived from the encoding instead of by decoding it. */
	public get decodedBytes(): number {
		const padding = this.base64.endsWith(`${PADDING}${PADDING}`) ? 2 : this.base64.endsWith(PADDING) ? 1 : 0;
		return Math.floor((this.base64.length * 3) / 4) - padding;
	}

	/** What this costs a context: a declared projection, never the size of the payload. */
	public get characters(): number {
		return ProjectedMediaCost.ofImage().characters;
	}

	public get isImage(): boolean {
		return this.mediaType.startsWith("image/");
	}

	/** The data URL written back out, which is the shape most consumers expect to receive. */
	public toDataUrl(): string {
		return `${DATA_URL_PREFIX}${this.mediaType}${BASE64_MARKER},${this.base64}`;
	}

	private static agreedTypeOf(declared: string, fromUrl: string): string {
		if (declared.length > 0 && declared !== fromUrl) {
			throw new MalformedMediaError(`media type ${declared} does not match the data URL type ${fromUrl}`);
		}
		return fromUrl;
	}

	private static dataUrlOf(data: string): { mediaType: string; base64: string } | undefined {
		if (!data.toLowerCase().startsWith(DATA_URL_PREFIX)) return undefined;
		const comma = data.indexOf(",");
		if (comma === -1) throw new MalformedMediaError("the data URL has no content");

		const metadata = data.slice(DATA_URL_PREFIX.length, comma).toLowerCase();
		if (!metadata.endsWith(BASE64_MARKER)) throw new MalformedMediaError("the data URL is not base64 encoded");

		const mediaType = metadata.slice(0, -BASE64_MARKER.length);
		if (mediaType.length === 0) throw new MalformedMediaError("the data URL declares no media type");
		return { mediaType, base64: data.slice(comma + 1) };
	}

	/**
	 * True when the string is base64 as an encoder would have written it.
	 *
	 * Decoders are forgiving: they accept stray characters and wrong padding and answer
	 * with bytes that are not the image. That leniency is exactly what has to be refused
	 * here, so the check is the strict one and it never allocates the decoded copy.
	 */
	private static isCanonicalBase64(value: string): boolean {
		if (value.length === 0 || value.length % 4 !== 0) return false;
		const padding = value.endsWith(`${PADDING}${PADDING}`) ? 2 : value.endsWith(PADDING) ? 1 : 0;
		for (let index = 0; index < value.length - padding; index += 1) {
			if (!MediaPart.isBase64Char(value.charCodeAt(index))) return false;
		}
		return true;
	}

	private static isBase64Char(code: number): boolean {
		const isUpper = code >= 65 && code <= 90;
		const isLower = code >= 97 && code <= 122;
		const isDigit = code >= 48 && code <= 57;
		return isUpper || isLower || isDigit || code === 43 || code === 47;
	}
}
