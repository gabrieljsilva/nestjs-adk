const MEBIBYTE = 1024 * 1024;
const MAX_ENCODED_BYTES = 5 * MEBIBYTE;
const MAX_DECODED_BYTES = 6 * MEBIBYTE;
const MAX_TOTAL_ENCODED_BYTES = 8 * MEBIBYTE;

const SUPPORTED_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/**
 * What a request may carry as media: one image encoded, one image decoded, and every image
 * together, plus the accepted types. The defaults are what the providers themselves enforce.
 * A loopback or private-range media URL is refused unless `allowingPrivateHosts` allows it.
 */
export class MediaLimits {
	public readonly supportedTypes: readonly string[];

	public constructor(
		public readonly maxEncodedBytes: number,
		public readonly maxDecodedBytes: number,
		public readonly maxTotalEncodedBytes: number,
		supportedTypes: readonly string[] = SUPPORTED_TYPES,
		public readonly allowsPrivateHost: boolean = false,
	) {
		this.supportedTypes = [...supportedTypes];
	}

	public static byDefault(): MediaLimits {
		return new MediaLimits(MAX_ENCODED_BYTES, MAX_DECODED_BYTES, MAX_TOTAL_ENCODED_BYTES, SUPPORTED_TYPES, false);
	}

	public allowingPrivateHosts(): MediaLimits {
		return new MediaLimits(
			this.maxEncodedBytes,
			this.maxDecodedBytes,
			this.maxTotalEncodedBytes,
			this.supportedTypes,
			true,
		);
	}

	public supports(mediaType: string): boolean {
		return this.supportedTypes.includes(mediaType);
	}
}
