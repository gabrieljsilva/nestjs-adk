import { Injectable } from "@nestjs/common";
import { PricingStorage } from "../abstracts/pricing-storage";
import type { PricingCatalog } from "../pricing/pricing-types";

/** Minimal surface every Redis client already implements: the lib brings no client dependency of its own. */
export interface RedisLikeClient {
	get(key: string): Promise<string | null>;
	set(key: string, value: string): Promise<unknown>;
}

export interface RedisPricingStorageOptions {
	client: RedisLikeClient;
	/** Default: `adk:pricing:catalog`. */
	key?: string;
}

/**
 * The only storage shared between replicas: one instance fetches, every other one reads.
 * Without it, N pods download the same 1.67 MB on every refresh window.
 */
@Injectable()
export class RedisPricingStorage extends PricingStorage {
	private readonly client: RedisLikeClient;
	private readonly key: string;

	public constructor(options: RedisPricingStorageOptions) {
		super();
		this.client = options.client;
		this.key = options.key ?? "adk:pricing:catalog";
	}

	/** Failures propagate: the source turns them into a cache miss AND logs them; swallowing here would hide a Redis outage. */
	public async read(): Promise<PricingCatalog | undefined> {
		const raw = await this.client.get(this.key);
		return raw ? (JSON.parse(raw) as PricingCatalog) : undefined;
	}

	public async write(catalog: PricingCatalog): Promise<void> {
		await this.client.set(this.key, JSON.stringify(catalog));
	}
}
