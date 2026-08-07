import { AdkError } from "../../../common/errors/adk.error";

/**
 * The payload is not a catalog at all.
 *
 * This is not the same as a catalog with a bad row in it. A single malformed entry is dropped and
 * the rest of the table still prices, but a payload that is an array, a string or null says the
 * transport answered something else entirely: a login page, an error body, a truncated download.
 * Projecting it would replace a working catalog with an empty one, so it throws instead and the
 * source keeps what it already had.
 */
export class MalformedCatalogError extends AdkError {
	public readonly code = "PRICING_MALFORMED_CATALOG";

	public constructor(public readonly received: string) {
		super(`Price catalog payload is not an object: received ${received}.`);
	}
}
