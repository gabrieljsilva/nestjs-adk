import { AdkError } from "../../../common/errors/adk.error";

/**
 * The attachment is of a type the limits do not accept.
 * Raised at the boundary rather than at the call, where the provider would refuse or
 * silently ignore the bytes.
 */
export class UnsupportedMediaTypeError extends AdkError {
	public readonly code = "MEDIA_UNSUPPORTED_TYPE";

	public constructor(
		public readonly mediaType: string,
		public readonly supported: readonly string[],
	) {
		super(`Media type ${mediaType} is not supported. Supported types: ${supported.join(", ")}.`);
	}
}
