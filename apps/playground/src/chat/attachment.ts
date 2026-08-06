import { MediaPart } from "@nestjs-adk/core";
import { InvalidAttachmentError } from "./errors/invalid-attachment.error";

/** An address the provider can fetch for itself, which is what an upload leaves behind. */
const ADDRESS_PREFIXES = ["http://", "https://"];

/** `type/subtype`, which is all a media type has to look like for the runtime to route it. */
const MEDIA_TYPE = /^[a-z]+\/[a-z0-9.+-]+$/i;

/**
 * One file a customer attached to a message, as an address or as bytes.
 *
 * Both shapes exist because both happen. A chat that uploads first sends where the file
 * is, which costs nothing to store and nothing to send. A client that has the bytes in
 * hand, a mobile camera being the usual one, sends them base64 encoded and never uploads
 * anywhere. What the runtime does with each is different, and deciding which is which is
 * the one thing this class is for.
 *
 * The type travels either way, because nothing can be inferred from an address and the
 * model has to be told what it is about to look at.
 */
export class Attachment {
	private constructor(
		public readonly mediaType: string,
		private readonly address?: string,
		private readonly encoded?: string,
	) {}

	/** A file somebody already uploaded, named by URL. */
	public static of(url: string, mediaType: string): Attachment {
		if (!ADDRESS_PREFIXES.some((prefix) => url.startsWith(prefix))) {
			throw new InvalidAttachmentError(url, "an http address");
		}
		Attachment.assertMediaType(url, mediaType);
		return new Attachment(mediaType, url);
	}

	/** The bytes themselves, base64 encoded, for a client that never uploaded anything. */
	public static bytes(base64: string, mediaType: string): Attachment {
		if (base64 === "") throw new InvalidAttachmentError(base64, "base64 content");
		Attachment.assertMediaType("the attached bytes", mediaType);
		return new Attachment(mediaType, undefined, base64);
	}

	/** What a request body carries: a list of attachments, or nothing, and unknown until read. */
	public static listFrom(value: unknown): readonly Attachment[] {
		if (value === undefined || value === null) return [];
		if (!Array.isArray(value)) throw new InvalidAttachmentError(String(value), "a list of attachments");
		return value.map((entry) => Attachment.from(entry));
	}

	public get isImage(): boolean {
		return this.mediaType.startsWith("image/");
	}

	public get isHosted(): boolean {
		return this.address !== undefined;
	}

	/** Where the file is, for a caller that records the attachment rather than sends it. */
	public get url(): string | undefined {
		return this.address;
	}

	/** The shape the runtime takes, which is the only reason this class knows about media. */
	public toMediaPart(): MediaPart {
		const address = this.address;
		if (address !== undefined) return MediaPart.link(address, this.mediaType);
		return MediaPart.image(this.mediaType, this.encoded ?? "");
	}

	private static from(entry: unknown): Attachment {
		const mediaType = Attachment.textIn(entry, "mediaType");
		const base64 = Attachment.optionalTextIn(entry, "base64");
		if (base64 !== undefined) return Attachment.bytes(base64, mediaType);
		return Attachment.of(Attachment.textIn(entry, "url"), mediaType);
	}

	private static assertMediaType(subject: string, mediaType: string): void {
		if (!MEDIA_TYPE.test(mediaType)) {
			throw new InvalidAttachmentError(subject, "a file with a media type such as image/png");
		}
	}

	private static textIn(entry: unknown, field: string): string {
		const value = Attachment.optionalTextIn(entry, field);
		if (value === undefined) throw new InvalidAttachmentError(String(entry), `${field} in text`);
		return value;
	}

	private static optionalTextIn(entry: unknown, field: string): string | undefined {
		const value = typeof entry === "object" && entry !== null ? Reflect.get(entry, field) : undefined;
		if (value === undefined || value === null) return undefined;
		if (typeof value !== "string" || value === "") throw new InvalidAttachmentError(String(entry), `${field} in text`);
		return value;
	}
}
