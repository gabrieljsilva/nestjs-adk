import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PricingCatalog } from "../pricing/pricing-types";
import { FileSystemPricingStorage } from "./file-system-pricing-storage";
import { InMemoryPricingStorage } from "./in-memory-pricing-storage";
import { type RedisLikeClient, RedisPricingStorage } from "./redis-pricing-storage";

const CATALOG: PricingCatalog = {
	v: 1,
	entries: { "gemini-2.5-flash": { input: 3e-7, output: 2.5e-6 } },
	asOf: "2026-07-25T00:00:00.000Z",
	source: "test",
};

describe("InMemoryPricingStorage", () => {
	it("starts empty and returns the last catalog written", async () => {
		const storage = new InMemoryPricingStorage();

		expect(await storage.read()).toBeUndefined();
		await storage.write(CATALOG);

		expect(await storage.read()).toEqual(CATALOG);
	});
});

describe("FileSystemPricingStorage", () => {
	async function storageInTempDir() {
		const dir = await mkdtemp(join(tmpdir(), "adk-pricing-"));
		return {
			path: join(dir, "nested", "catalog.json"),
			storage: new FileSystemPricingStorage({ path: join(dir, "nested", "catalog.json") }),
		};
	}

	it("creates the directory and survives a new instance", async () => {
		const { path, storage } = await storageInTempDir();

		await storage.write(CATALOG);

		expect(await new FileSystemPricingStorage({ path }).read()).toEqual(CATALOG);
	});

	it("a missing file is a cache miss", async () => {
		const storage = new FileSystemPricingStorage({ path: join(tmpdir(), "adk-pricing-missing", "catalog.json") });

		expect(await storage.read()).toBeUndefined();
	});

	it("corrupt content surfaces instead of passing for an empty cache", async () => {
		const { path, storage } = await storageInTempDir();
		await storage.write(CATALOG);
		await writeFile(path, "{ half a catalo", "utf8");

		await expect(storage.read()).rejects.toThrow();
	});

	it("writes through a temp file, so the final path never holds a partial catalog", async () => {
		const { path, storage } = await storageInTempDir();

		await storage.write(CATALOG);

		expect(JSON.parse(await readFile(path, "utf8"))).toEqual(CATALOG);
	});
});

describe("RedisPricingStorage", () => {
	function fakeClient(initial?: string): RedisLikeClient & { store: Map<string, string> } {
		const store = new Map<string, string>();
		if (initial) store.set("adk:pricing:catalog", initial);
		return {
			store,
			get: async (key) => store.get(key) ?? null,
			set: async (key, value) => store.set(key, value),
		};
	}

	it("round-trips through the injected client under the default key", async () => {
		const client = fakeClient();
		const storage = new RedisPricingStorage({ client });

		await storage.write(CATALOG);

		expect(await storage.read()).toEqual(CATALOG);
		expect(client.store.has("adk:pricing:catalog")).toBe(true);
	});

	it("honors a custom key, so replicas of different apps do not share a catalog", async () => {
		const client = fakeClient();

		await new RedisPricingStorage({ client, key: "app-a:pricing" }).write(CATALOG);

		expect(client.store.has("app-a:pricing")).toBe(true);
	});

	it("an unreachable client surfaces the failure — a silent miss would hide the outage", async () => {
		const storage = new RedisPricingStorage({
			client: {
				get: async () => {
					throw new Error("connection refused");
				},
				set: async () => undefined,
			},
		});

		await expect(storage.read()).rejects.toThrow("connection refused");
	});

	it("garbage in the key surfaces too", async () => {
		await expect(new RedisPricingStorage({ client: fakeClient("not json") }).read()).rejects.toThrow();
	});
});
