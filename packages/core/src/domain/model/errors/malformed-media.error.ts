import { AdkError } from "../../../common/errors/adk.error";

/**
 * The attachment does not decode to the bytes it claims to be: non-canonical base64, a data
 * URL that is not base64, or a declared type that disagrees with the data URL's.
 * Raised at the boundary, so the request is never paid for and then rejected.
 */
export class MalformedMediaError extends AdkError {
	public readonly code = "MEDIA_MALFORMED";

	public constructor(public readonly reason: string) {
		super(`The attachment could not be read: ${reason}.`);
	}
}
