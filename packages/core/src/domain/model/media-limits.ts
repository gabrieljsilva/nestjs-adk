const MEBIBYTE = 1024 * 1024;
const MAX_ENCODED_BYTES = 5 * MEBIBYTE;
const MAX_DECODED_BYTES = 6 * MEBIBYTE;
const MAX_TOTAL_ENCODED_BYTES = 8 * MEBIBYTE;

/** Every image format a provider here is known to accept. */
const SUPPORTED_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/**
 * What a request is allowed to carry as media, and of what kind.
 *
 * Three ceilings and not one: an image can be small encoded and large decoded, and a set
 * of images that each fit can still overflow a request together. The defaults are the
 * ones the providers themselves enforce, so a request refused here would have been
 * refused there, after being paid for.
 */
export class MediaLimits {
	private constructor(
		public readonly maxEncodedBytes: number,
		public readonly maxDecodedBytes: number,
		public readonly maxTotalEncodedBytes: number,
		public readonly supportedTypes: readonly string[],
	) {}

	public static byDefault(): MediaLimits {
		return new MediaLimits(MAX_ENCODED_BYTES, MAX_DECODED_BYTES, MAX_TOTAL_ENCODED_BYTES, SUPPORTED_TYPES);
	}

	public static of(
		maxEncodedBytes: number,
		maxDecodedBytes: number,
		maxTotalEncodedBytes: number,
		supportedTypes: readonly string[] = SUPPORTED_TYPES,
	): MediaLimits {
		return new MediaLimits(maxEncodedBytes, maxDecodedBytes, maxTotalEncodedBytes, [...supportedTypes]);
	}

	public supports(mediaType: string): boolean {
		return this.supportedTypes.includes(mediaType);
	}
}
