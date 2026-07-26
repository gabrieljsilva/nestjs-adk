import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { PricingSource } from "../abstracts/pricing-source";
import type { PricingStorage } from "../abstracts/pricing-storage";
import { InMemoryPricingStorage } from "../stores/in-memory-pricing-storage";
import { applyOverride, resolveModelPrice } from "./cost-calculator";
import { projectLiteLlmCatalog } from "./litellm-projection";
import type { ModelPrice, PriceOverride, PricingCatalog } from "./pricing-types";

const DEFAULT_URL = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const DEFAULT_REFRESH_MS = 4 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 15_000;
/** The real catalog is ~1.7 MB; the ceiling exists so a hostile origin cannot exhaust the consumer's heap. */
const MAX_PAYLOAD_BYTES = 32 * 1024 * 1024;

export interface LiteLLMPricingSourceOptions {
	/** Catalog origin. Default: the LiteLLM file on `main`. Pin a commit SHA instead of a branch for reproducibility. */
	url?: string;
	/** How long a catalog stays fresh before revalidation, in ms. Default: 4h. */
	refreshEvery?: number;
	/** Per-request timeout, in ms. Default: 15s. */
	timeout?: number;
	/** Default: InMemoryPricingStorage (per process). */
	storage?: PricingStorage;
	/** Price corrections by model id — contract discounts, internal models, catalog fixes. */
	overrides?: Record<string, PriceOverride>;
}

/**
 * Community catalog as a live source: fetch, project, persist, revalidate — all at runtime,
 * inside the lib. The catalog in memory is only ever replaced by a NEW and VALID payload, so a
 * broken origin, a timeout or an unexpected format costs an error log, never the prices already loaded.
 * Nothing here blocks boot or the run path.
 */
@Injectable()
export class LiteLLMPricingSource extends PricingSource implements OnApplicationBootstrap, OnApplicationShutdown {
	private readonly logger = new Logger("Adk:pricing");
	private readonly url: string;
	/** The URL without query or credentials — a private mirror may carry a token there, and this one is logged and persisted. */
	private readonly safeUrl: string;
	private readonly refreshEvery: number;
	private readonly timeout: number;
	private readonly storage: PricingStorage;
	private readonly overrides: Record<string, PriceOverride>;
	/** Memo of resolved lookups (including misses) — the prefix fallback scans every entry. */
	private readonly resolved = new Map<string, ModelPrice | undefined>();

	private catalog?: PricingCatalog;
	private timer?: ReturnType<typeof setInterval>;
	private started = false;

	public constructor(options: LiteLLMPricingSourceOptions = {}) {
		super();
		this.url = options.url ?? DEFAULT_URL;
		this.safeUrl = redactUrl(this.url);
		this.refreshEvery = options.refreshEvery ?? DEFAULT_REFRESH_MS;
		this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
		this.storage = options.storage ?? new InMemoryPricingStorage();
		this.overrides = options.overrides ?? {};
	}

	public onApplicationBootstrap(): void {
		this.start().catch((error: unknown) => this.logger.error(`start failed: ${describeError(error)}`));
	}

	public onApplicationShutdown(): void {
		this.stop();
	}

	/** Adopts whatever the storage has, then revalidates in the background. Safe to call more than once. */
	public async start(): Promise<void> {
		if (this.started) return;
		this.started = true;

		const stored = await this.readStorage();
		if (stored) this.adopt(stored, "storage");
		// stop() may have run while the storage read was in flight — arming now would orphan the timer
		if (!this.started) return;

		this.timer = setInterval(() => {
			this.refresh().catch((error: unknown) => this.logger.error(`refresh failed: ${describeError(error)}`));
		}, this.refreshEvery);
		// a pricing refresh must never be the reason a process stays alive
		this.timer.unref?.();
		await this.refresh();
	}

	public stop(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = undefined;
		this.started = false;
	}

	public priceFor(model: string): ModelPrice | undefined {
		const override = this.overrides[model];
		if (this.resolved.has(model)) return applyOverride(this.resolved.get(model), override);

		const price = this.catalog ? resolveModelPrice(this.catalog.entries, model) : undefined;
		this.resolved.set(model, price);
		return applyOverride(price, override);
	}

	public asOf(): string | undefined {
		return this.catalog?.asOf;
	}

	/** Revalidates against the origin. Errors are logged and swallowed — the loaded catalog stays. */
	public async refresh(): Promise<void> {
		const shared = await this.readStorage();
		// another replica may have just refreshed — adopting its catalog saves a 1.67 MB download
		if (shared && this.isFresh(shared) && shared.asOf !== this.catalog?.asOf) {
			this.adopt(shared, "storage");
			return;
		}
		if (this.catalog && this.isFresh(this.catalog)) return;

		try {
			const response = await fetch(this.url, {
				headers: this.catalog?.etag ? { "if-none-match": this.catalog.etag } : undefined,
				signal: AbortSignal.timeout(this.timeout),
			});

			if (response.status === 304) {
				this.touch();
				// shares the new window with the other replicas, so they skip the download too
				if (this.catalog) await this.writeStorage(this.catalog);
				return;
			}
			if (!response.ok) {
				this.keep(`origin answered ${response.status}`);
				return;
			}

			const now = new Date().toISOString();
			const payload = await readCapped(response);
			const catalog = projectLiteLlmCatalog(payload, {
				source: this.safeUrl,
				asOf: now,
				checkedAt: now,
				etag: response.headers.get("etag") ?? undefined,
			});
			if (!catalog) {
				this.keep("payload has no usable model — unexpected format");
				return;
			}

			this.adopt(catalog, "origin");
			await this.writeStorage(catalog);
		} catch (error) {
			this.keep(describeError(error));
		}
	}

	/** Freshness follows the last successful revalidation, which a 304 refreshes without changing the data. */
	private isFresh(catalog: PricingCatalog): boolean {
		const age = Date.now() - Date.parse(catalog.checkedAt ?? catalog.asOf);
		return Number.isFinite(age) && age >= 0 && age < this.refreshEvery;
	}

	/** A storage can hand back anything (older format, corrupt value) — an invalid catalog is ignored, never adopted. */
	private adopt(catalog: PricingCatalog, origin: "storage" | "origin"): void {
		if (catalog.v !== 1 || typeof catalog.entries !== "object" || catalog.entries === null) {
			this.logger.error(`catalog from ${origin} is not readable (format v${catalog.v}) — ignored`);
			return;
		}
		this.catalog = catalog;
		this.resolved.clear();
		this.logger.log(`catalog from ${origin}: ${Object.keys(catalog.entries).length} models (asOf ${catalog.asOf})`);
	}

	/** 304: the data is unchanged, so only the freshness window moves — `asOf` keeps telling the real age. */
	private touch(): void {
		if (this.catalog) this.catalog = { ...this.catalog, checkedAt: new Date().toISOString() };
	}

	private keep(reason: string): void {
		if (this.catalog) {
			this.logger.error(`refresh from ${this.safeUrl} failed: ${reason} — keeping catalog from ${this.catalog.asOf}`);
			return;
		}
		this.logger.error(
			`refresh from ${this.safeUrl} failed: ${reason} — no catalog available, runs report tokens without cost`,
		);
	}

	private async readStorage(): Promise<PricingCatalog | undefined> {
		try {
			return await this.storage.read();
		} catch (error) {
			this.logger.error(`storage read failed: ${describeError(error)}`);
			return undefined;
		}
	}

	private async writeStorage(catalog: PricingCatalog): Promise<void> {
		try {
			await this.storage.write(catalog);
		} catch (error) {
			this.logger.error(`storage write failed: ${describeError(error)}`);
		}
	}
}

/**
 * Reads the body counting bytes. `response.json()` would buffer whatever the origin decides to send,
 * and a chunked response has no content-length to check upfront.
 */
async function readCapped(response: Response): Promise<unknown> {
	const declared = Number(response.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > MAX_PAYLOAD_BYTES) {
		throw new Error(`payload declares ${declared} bytes, over the ${MAX_PAYLOAD_BYTES} limit`);
	}

	const reader = response.body?.getReader();
	if (!reader) return response.json();

	const chunks: Uint8Array[] = [];
	let size = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > MAX_PAYLOAD_BYTES) {
			await reader.cancel();
			throw new Error(`payload exceeded the ${MAX_PAYLOAD_BYTES} byte limit`);
		}
		chunks.push(value);
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** Keeps origin and path, drops query and userinfo — a mirror URL can carry a token in either. */
function redactUrl(url: string): string {
	try {
		const parsed = new URL(url);
		return `${parsed.origin}${parsed.pathname}`;
	} catch {
		return url;
	}
}

/** Node's fetch reports every network failure as "fetch failed" — the real reason lives in `cause`. */
function describeError(error: unknown): string {
	if (!(error instanceof Error)) return String(error);
	const cause = error.cause instanceof Error ? error.cause.message : undefined;
	return cause ? `${error.message} (${cause})` : error.message;
}
