import { MalformedMediaError } from "./errors/malformed-media.error";
import { MediaTooLargeError } from "./errors/media-too-large.error";
import { UnsupportedMediaTypeError } from "./errors/unsupported-media-type.error";
import { MediaLimits } from "./media-limits";
import { ProjectedMediaCost } from "./projected-media-cost";

const DATA_URL_PREFIX = "data:";
const BASE64_MARKER = ";base64";
const PADDING = "=";
const REMOTE_SCHEMES: readonly string[] = ["http:", "https:"];

/**
 * Something the model looks at rather than reads: an image, and nothing else for now.
 *
 * It arrives one of two ways, because the providers accept both. Bytes travel base64
 * encoded, which is what a JSON request carries and what a journal can hold a reference
 * to. A link travels as a URL the provider fetches itself, which costs nothing to store
 * and nothing to send, and is the shape an application already has after an upload.
 *
 * Both are validated here rather than at the call: an unsupported type, base64 that does
 * not decode, an image over the limit and a URL nobody can fetch all end the same way at
 * the provider, which is a rejected request that was already paid for. What cannot be
 * checked here is whether the link is reachable from the provider's network, and that is
 * the one thing this shape gives up in exchange for not moving the bytes.
 *
 * It is deliberately not a union of every modality. Audio and video are different problems
 * with different limits, and a type that claims to carry them before anything does would
 * be a promise nobody kept.
 */
export class MediaPart {
	private constructor(
		public readonly mediaType: string,
		private readonly encoded?: string,
		private readonly remote?: string,
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

	/**
	 * An image the provider fetches for itself, named by URL.
	 *
	 * The type is still declared, because Gemini asks for it alongside the URI and because
	 * a link nobody described is a link nothing can validate. Only http and https are
	 * accepted: a `file:` or `data:` URL here would either fail at the provider or smuggle
	 * bytes through a field meant to hold a name.
	 */
	public static link(url: string, mediaType: string, limits: MediaLimits = MediaLimits.byDefault()): MediaPart {
		const declared = mediaType.trim().toLowerCase();
		if (!limits.supports(declared)) throw new UnsupportedMediaTypeError(declared, limits.supportedTypes);

		const address = MediaPart.remoteAddressOf(url.trim());
		return new MediaPart(declared, undefined, address);
	}

	/** True when the bytes are somewhere else and only their address travels. */
	public get isRemote(): boolean {
		return this.remote !== undefined;
	}

	/** The address a provider is expected to fetch, or nothing for an image that travels whole. */
	public get url(): string | undefined {
		return this.remote;
	}

	/** The encoding a request carries; empty for an image the provider fetches itself. */
	public get base64(): string {
		return this.encoded ?? "";
	}

	/** What the request carries for this attachment, which is nothing at all for a link. */
	public get encodedBytes(): number {
		return this.base64.length;
	}

	/** The size of the image itself, derived from the encoding instead of by decoding it. */
	public get decodedBytes(): number {
		const base64 = this.base64;
		const padding = base64.endsWith(`${PADDING}${PADDING}`) ? 2 : base64.endsWith(PADDING) ? 1 : 0;
		return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
	}

	/** What this costs a context: a declared projection, never the size of the payload. */
	public get characters(): number {
		return ProjectedMediaCost.ofImage().characters;
	}

	public get isImage(): boolean {
		return this.mediaType.startsWith("image/");
	}

	/**
	 * The one string an OpenAI style request wants, whichever way the image arrived.
	 * A link is already that string, and bytes become the data URL they came from.
	 */
	public toUrl(): string {
		return this.remote ?? `${DATA_URL_PREFIX}${this.mediaType}${BASE64_MARKER},${this.base64}`;
	}

	private static remoteAddressOf(url: string): string {
		let parsed: URL;
		try {
			parsed = new URL(url);
		} catch {
			throw new MalformedMediaError("the address is not a URL");
		}
		if (!REMOTE_SCHEMES.includes(parsed.protocol)) {
			throw new MalformedMediaError(`the address is ${parsed.protocol} and only http and https are fetchable`);
		}
		return parsed.toString();
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
