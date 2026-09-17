import { CatalogTransport } from "./catalog-transport.contract";
import { CatalogUnreachableError } from "./errors/catalog-unreachable.error";

const LITELLM_CATALOG_URL =
	"https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

const DEFAULT_TIMEOUT_MILLIS = 10_000;

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
