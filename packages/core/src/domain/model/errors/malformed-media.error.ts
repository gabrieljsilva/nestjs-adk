import { AdkError } from "../../../common/errors/adk.error";

/**
 * The attachment does not decode to the bytes it claims to be.
 *
 * Base64 that is not canonical, a data URL that never says it is base64, or a declared
 * type that disagrees with the one written into the data URL. All three produce the same
 * outcome at the provider, which is a request rejected after it was paid for, so all
 * three are refused here with the reason named.
 */
export class MalformedMediaError extends AdkError {
	public readonly code = "MEDIA_MALFORMED";

	public constructor(public readonly reason: string) {
		super(`The attachment could not be read: ${reason}.`);
	}
}
