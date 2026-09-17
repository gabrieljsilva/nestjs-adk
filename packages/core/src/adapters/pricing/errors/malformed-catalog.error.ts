import { AdkError } from "../../../common/errors/adk.error";

/**
 * The payload is not a catalog at all: an array, a string, a login page. A single bad row is
 * dropped instead, so this means the transport answered something else entirely. The source
 * catches it and keeps the table it already had.
 */
export class MalformedCatalogError extends AdkError {
	public readonly code = "PRICING_MALFORMED_CATALOG";

	public constructor(public readonly received: string) {
		super(`Price catalog payload is not an object: received ${received}.`);
	}
}
