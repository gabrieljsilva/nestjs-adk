import { AdkError } from "../../../common/errors/adk.error";

/**
 * The address points at a network only this process can see, and a media URL is fetched by
 * the provider rather than here.
 * Send the bytes instead, or use `MediaLimits.allowingPrivateHosts()` for a model that can reach it.
 */
export class UnreachableMediaUrlError extends AdkError {
	public readonly code = "MEDIA_URL_UNREACHABLE";

	public constructor(public readonly hostname: string) {
		super(
			`The address at ${hostname} is not reachable from a provider's network; a media URL is fetched by the provider, not by this process. Send the bytes instead, or use MediaLimits.allowingPrivateHosts() for a model that can reach it.`,
		);
	}
}
