import { CatalogTransport } from "./catalog-transport";
import { CatalogUnreachableError } from "./errors/catalog-unreachable.error";

/** Where LiteLLM publishes the table. It is a raw file, so there is no API contract to depend on. */
const LITELLM_CATALOG_URL =
	"https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

const DEFAULT_TIMEOUT_MILLIS = 10_000;

/**
 * Reads a catalog over HTTP with `fetch`.
 *
 * The file is around 1.6 MB and is read once per TTL, never on the path of a turn. A timeout is
 * still declared, because a source that hangs would hold the report of a run that has already
 * finished answering.
 *
 * A non `2xx` answer throws rather than parsing: GitHub serves an HTML page for a moved file, and
 * projecting that would replace a working catalog with nothing.
 */
export class HttpCatalogTransport extends CatalogTransport {
	public constructor(
		private readonly url: string = LITELLM_CATALOG_URL,
		private readonly timeoutMillis: number = DEFAULT_TIMEOUT_MILLIS,
	) {
		super();
	}

	public async read(): Promise<unknown> {
		const response = await this.request();
		if (!response.ok) throw new CatalogUnreachableError(this.url, response.status);
		try {
			return await response.json();
		} catch (cause) {
			throw new CatalogUnreachableError(this.url, response.status, { cause });
		}
	}

	private async request(): Promise<Response> {
		try {
			return await fetch(this.url, { signal: AbortSignal.timeout(this.timeoutMillis) });
		} catch (cause) {
			throw new CatalogUnreachableError(this.url, undefined, { cause });
		}
	}
}
