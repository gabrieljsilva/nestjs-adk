import { Logger } from "@nestjs/common";
import { PricingStorage } from "../abstracts/pricing-storage";
import { LiteLLMPricingSource } from "./litellm-pricing-source";
import type { PricingCatalog } from "./pricing-types";

const FLASH = { mode: "chat", input_cost_per_token: 3e-7, output_cost_per_token: 2.5e-6 };
const PRO = { mode: "chat", input_cost_per_token: 1.25e-6, output_cost_per_token: 1e-5 };

class FakeStorage extends PricingStorage {
	public writes = 0;

	public constructor(private catalog?: PricingCatalog) {
		super();
	}

	public async read(): Promise<PricingCatalog | undefined> {
		return this.catalog;
	}

	public async write(catalog: PricingCatalog): Promise<void> {
		this.writes += 1;
		this.catalog = catalog;
	}
}

function catalogOf(entries: Record<string, unknown>, asOf: string): PricingCatalog {
	return { v: 1, entries: entries as PricingCatalog["entries"], asOf, source: "storage" };
}

function respond(payload: unknown, init: { status?: number; etag?: string } = {}) {
	const status = init.status ?? 200;
	return {
		status,
		ok: status >= 200 && status < 300,
		json: async () => payload,
		headers: { get: () => init.etag ?? null },
	};
}

/** Never fresh: every refresh() actually goes to the origin, with no timer involved. */
function sourceAlwaysStale(storage: PricingStorage) {
	return new LiteLLMPricingSource({ storage, refreshEvery: 0 });
}

describe("LiteLLMPricingSource", () => {
	let errors: string[];

	beforeEach(() => {
		errors = [];
		vi.spyOn(Logger.prototype, "error").mockImplementation((...args: unknown[]) => {
			errors.push(String(args[0]));
		});
		vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it("fetches, projects, prices and persists the catalog", async () => {
		const storage = new FakeStorage();
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => respond({ "gemini-2.5-flash": FLASH })),
		);
		const source = sourceAlwaysStale(storage);

		await source.refresh();

		expect(source.priceFor("gemini-2.5-flash")).toEqual({ input: 3e-7, output: 2.5e-6 });
		expect(source.asOf()).toBeDefined();
		expect(storage.writes).toBe(1);
	});

	it("adopts what the storage already has when it is still fresh, without hitting the origin", async () => {
		const fresh = catalogOf({ "gemini-2.5-flash": { input: 1e-9, output: 2e-9 } }, new Date().toISOString());
		const fetchMock = vi.fn(async () => respond({}));
		vi.stubGlobal("fetch", fetchMock);
		const source = new LiteLLMPricingSource({ storage: new FakeStorage(fresh), refreshEvery: 60_000 });

		await source.start();
		source.stop();

		expect(source.priceFor("gemini-2.5-flash")).toEqual({ input: 1e-9, output: 2e-9 });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("a failing origin keeps the catalog already loaded and logs the error", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(respond({ "gemini-2.5-flash": FLASH }))
			.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND"));
		vi.stubGlobal("fetch", fetchMock);
		const source = sourceAlwaysStale(new FakeStorage());

		await source.refresh();
		await source.refresh();

		expect(source.priceFor("gemini-2.5-flash")).toEqual({ input: 3e-7, output: 2.5e-6 });
		expect(errors.some((line) => line.includes("keeping catalog from"))).toBe(true);
	});

	it("an HTTP error keeps the catalog too", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(respond({ "gemini-2.5-flash": FLASH }))
			.mockResolvedValueOnce(respond(undefined, { status: 503 }));
		vi.stubGlobal("fetch", fetchMock);
		const source = sourceAlwaysStale(new FakeStorage());

		await source.refresh();
		await source.refresh();

		expect(source.priceFor("gemini-2.5-flash")).toBeDefined();
		expect(errors.some((line) => line.includes("503"))).toBe(true);
	});

	it("an unexpected payload is discarded — the loaded prices do not change", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(respond({ "gemini-2.5-flash": FLASH }))
			.mockResolvedValueOnce(respond({ "gemini-2.5-flash": { mode: "chat", supports_vision: true } }));
		vi.stubGlobal("fetch", fetchMock);
		const storage = new FakeStorage();
		const source = sourceAlwaysStale(storage);

		await source.refresh();
		await source.refresh();

		expect(source.priceFor("gemini-2.5-flash")).toEqual({ input: 3e-7, output: 2.5e-6 });
		expect(storage.writes).toBe(1);
		expect(errors.some((line) => line.includes("unexpected format"))).toBe(true);
	});

	it("revalidates conditionally: a 304 keeps the entries and the real age of the data", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(respond({ "gemini-2.5-flash": FLASH }, { etag: 'W/"v1"' }))
			.mockResolvedValueOnce(respond(undefined, { status: 304 }));
		vi.stubGlobal("fetch", fetchMock);
		const source = sourceAlwaysStale(new FakeStorage());

		// the two refreshes would otherwise land on the same millisecond
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-25T00:00:00.000Z"));
		await source.refresh();
		const first = source.asOf();
		vi.setSystemTime(new Date("2026-07-25T05:00:00.000Z"));
		await source.refresh();

		expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ headers: { "if-none-match": 'W/"v1"' } });
		expect(source.priceFor("gemini-2.5-flash")).toBeDefined();
		// unchanged data keeps its original date: catalogAsOf must not disguise an old catalog as fresh
		expect(source.asOf()).toBe(first);
		expect(errors).toEqual([]);
	});

	it("with no catalog and no origin, prices are simply unavailable", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("offline");
			}),
		);
		const source = sourceAlwaysStale(new FakeStorage());

		await source.refresh();

		expect(source.priceFor("gemini-2.5-flash")).toBeUndefined();
		expect(source.asOf()).toBeUndefined();
		expect(errors.some((line) => line.includes("no catalog available"))).toBe(true);
	});

	it("overrides price models the catalog never knew and correct the ones it does", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => respond({ "gemini-2.5-flash": FLASH, "gemini-2.5-pro": PRO })),
		);
		const source = new LiteLLMPricingSource({
			storage: new FakeStorage(),
			refreshEvery: 0,
			overrides: {
				"internal-proxy": { inputPerMTok: 0.5, outputPerMTok: 1.5 },
				"gemini-2.5-flash": { inputPerMTok: 0.24 },
			},
		});

		await source.refresh();

		expect(source.priceFor("internal-proxy")).toEqual({ input: 5e-7, output: 1.5e-6 });
		expect(source.priceFor("gemini-2.5-flash")).toEqual({ input: 2.4e-7, output: 2.5e-6 });
		expect(source.priceFor("gemini-2.5-pro")).toEqual({ input: 1.25e-6, output: 1e-5 });
	});

	it("a broken storage is a cache miss, not a crash", async () => {
		class BrokenStorage extends PricingStorage {
			public async read(): Promise<PricingCatalog | undefined> {
				throw new Error("redis down");
			}

			public async write(): Promise<void> {
				throw new Error("redis down");
			}
		}
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => respond({ "gemini-2.5-flash": FLASH })),
		);
		const source = sourceAlwaysStale(new BrokenStorage());

		await source.refresh();

		expect(source.priceFor("gemini-2.5-flash")).toBeDefined();
		expect(errors.some((line) => line.includes("storage"))).toBe(true);
	});
});
