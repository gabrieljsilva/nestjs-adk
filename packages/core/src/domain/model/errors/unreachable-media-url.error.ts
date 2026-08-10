import { AdkError } from "../../../common/errors/adk.error";

/**
 * The address points at a network only this process can see.
 *
 * A media URL is not fetched by this process: it travels in the request and the provider
 * fetches it from its own network, where localhost is the provider's machine and a
 * private range goes nowhere. The request would be paid for and answered about an image
 * nobody fetched. A self hosted model that can reach the address is the exception, and it
 * is named with `MediaLimits.allowingPrivateHosts()`.
 */
export class UnreachableMediaUrlError extends AdkError {
	public readonly code = "MEDIA_URL_UNREACHABLE";

	public constructor(public readonly hostname: string) {
		super(
			`The address at ${hostname} is not reachable from a provider's network; a media URL is fetched by the provider, not by this process. Send the bytes instead, or use MediaLimits.allowingPrivateHosts() for a model that can reach it.`,
		);
	}
}
