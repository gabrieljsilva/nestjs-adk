import { AdkError } from "../../../common/errors/adk.error";

/**
 * The attachment is of a kind no provider here accepts.
 * It fails at the boundary rather than at the call, because a type nobody declared
 * support for reaches the provider as bytes it will refuse or, worse, ignore.
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
