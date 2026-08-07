import { AdkError } from "../../../common/errors/adk.error";

/**
 * The catalog could not be read.
 *
 * It is thrown by the transport and caught by the source, which keeps whatever table it already
 * had and prices from that. Nothing about a catalog being unreachable ever fails a run: the worst
 * case is a report whose models land in `unpriced`.
 */
export class CatalogUnreachableError extends AdkError {
	public readonly code = "PRICING_CATALOG_UNREACHABLE";

	public constructor(
		public readonly url: string,
		public readonly status?: number,
		options?: ErrorOptions,
	) {
		super(`Price catalog at ${url} could not be read${status === undefined ? "" : `: HTTP ${status}`}.`, options);
	}
}
