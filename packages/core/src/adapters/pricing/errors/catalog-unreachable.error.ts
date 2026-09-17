import { AdkError } from "../../../common/errors/adk.error";

/**
 * The pricing catalog could not be read. Thrown by the transport and caught by the source,
 * which keeps whatever table it already had; the worst case is a report whose models land in
 * `unpriced`. It never fails a run.
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
