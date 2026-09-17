import { MediaLimits } from "../descriptor/media-limits.value-object";
import { MalformedMediaError } from "../errors/malformed-media.error";
import { MediaTooLargeError } from "../errors/media-too-large.error";
import { UnreachableMediaUrlError } from "../errors/unreachable-media-url.error";
import { UnsupportedMediaTypeError } from "../errors/unsupported-media-type.error";
import { ProjectedMediaCost } from "../usage/projected-media-cost.value-object";

const DATA_URL_PREFIX = "data:";
const BASE64_MARKER = ";base64";
const PADDING = "=";
const REMOTE_SCHEMES: readonly string[] = ["http:", "https:"];

/**
 * Something the model looks at rather than reads: an image, either as base64 bytes or as a URL
 * the provider fetches for itself. Both forms are validated here against `MediaLimits` and throw
 * `UnsupportedMediaTypeError`, `MalformedMediaError`, `MediaTooLargeError` or
 * `UnreachableMediaUrlError`. Whether a link is reachable from the provider's network cannot be
 * checked here.
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
		const url = MediaPart.readDataUrl(data);
		const type = url === undefined ? declared : MediaPart.resolveAgreedType(declared, url.mediaType);
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

	public static link(url: string, mediaType: string, limits: MediaLimits = MediaLimits.byDefault()): MediaPart {
		const declared = mediaType.trim().toLowerCase();
		if (!limits.supports(declared)) throw new UnsupportedMediaTypeError(declared, limits.supportedTypes);

		const address = MediaPart.readRemoteAddress(url.trim(), limits.allowsPrivateHost);
		return new MediaPart(declared, undefined, address);
	}

	public get isRemote(): boolean {
		return this.remote !== undefined;
	}

	public get url(): string | undefined {
		return this.remote;
	}

	public get base64(): string {
		return this.encoded ?? "";
	}

	public get encodedBytes(): number {
		return this.base64.length;
	}

	public get decodedBytes(): number {
		const base64 = this.base64;
		const padding = base64.endsWith(`${PADDING}${PADDING}`) ? 2 : base64.endsWith(PADDING) ? 1 : 0;
		return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
	}

	public get characters(): number {
		return ProjectedMediaCost.ofImage().characters;
	}

	public get isImage(): boolean {
		return this.mediaType.startsWith("image/");
	}

	public toUrl(): string {
		return this.remote ?? `${DATA_URL_PREFIX}${this.mediaType}${BASE64_MARKER},${this.base64}`;
	}

	private static readRemoteAddress(url: string, allowsPrivateHost: boolean): string {
		let parsed: URL;
		try {
			parsed = new URL(url);
		} catch {
			throw new MalformedMediaError("the address is not a URL");
		}
		if (!REMOTE_SCHEMES.includes(parsed.protocol)) {
			throw new MalformedMediaError(`the address is ${parsed.protocol} and only http and https are fetchable`);
		}
		if (!allowsPrivateHost && MediaPart.isPrivateHost(parsed.hostname)) {
			throw new UnreachableMediaUrlError(parsed.hostname);
		}
		return parsed.toString();
	}

	private static isPrivateHost(hostname: string): boolean {
		const host = hostname.toLowerCase();
		if (host === "localhost" || host.endsWith(".localhost")) return true;
		if (host.endsWith(".local") || host.endsWith(".internal")) return true;
		if (host === "0.0.0.0") return true;
		// URL keeps an IPv6 host in brackets: loopback, unspecified, unique local (fc00::/7) and link local (fe80::/10).
		if (host === "[::1]" || host === "[::]") return true;
		if (host.startsWith("[fc") || host.startsWith("[fd") || /^\[fe[89ab]/.test(host)) return true;
		const mapped = MediaPart.readMappedIpv4(host);
		return MediaPart.isPrivateIpv4(mapped ?? host);
	}

	private static readMappedIpv4(host: string): string | undefined {
		// `URL` canonicalizes an IPv4-mapped IPv6 host into two hex groups, not dotted quads.
		const match = /^\[::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})\]$/.exec(host);
		if (match === null) return undefined;
		const high = Number.parseInt(match[1] ?? "", 16);
		const low = Number.parseInt(match[2] ?? "", 16);
		return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
	}

	private static isPrivateIpv4(host: string): boolean {
		const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
		if (match === null) return false;
		const [first, second] = [Number(match[1]), Number(match[2])];
		if (first === 127 || first === 10) return true;
		if (first === 192 && second === 168) return true;
		if (first === 172 && second >= 16 && second <= 31) return true;
		return first === 169 && second === 254;
	}

	private static resolveAgreedType(declared: string, fromUrl: string): string {
		if (declared.length > 0 && declared !== fromUrl) {
			throw new MalformedMediaError(`media type ${declared} does not match the data URL type ${fromUrl}`);
		}
		return fromUrl;
	}

	private static readDataUrl(data: string): { mediaType: string; base64: string } | undefined {
		if (!data.toLowerCase().startsWith(DATA_URL_PREFIX)) return undefined;
		const comma = data.indexOf(",");
		if (comma === -1) throw new MalformedMediaError("the data URL has no content");

		const metadata = data.slice(DATA_URL_PREFIX.length, comma).toLowerCase();
		if (!metadata.endsWith(BASE64_MARKER)) throw new MalformedMediaError("the data URL is not base64 encoded");

		const mediaType = metadata.slice(0, -BASE64_MARKER.length);
		if (mediaType.length === 0) throw new MalformedMediaError("the data URL declares no media type");
		return { mediaType, base64: data.slice(comma + 1) };
	}

	// Decoders accept stray characters and wrong padding and answer bytes that are not the image.
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
