import { InMemoryArtifactStore } from "./in-memory-artifact-store";

describe("InMemoryArtifactStore", () => {
	let store: InMemoryArtifactStore;
	const ref = { sessionId: "s1", name: "report.json" };

	beforeEach(() => {
		store = new InMemoryArtifactStore();
	});

	it("save versions incrementally starting from 0", async () => {
		expect(await store.save(ref, { mimeType: "application/json", data: "v0" })).toBe(0);
		expect(await store.save(ref, { mimeType: "application/json", data: "v1" })).toBe(1);
	});

	it("load without a version returns the most recent; with a version, the specific one", async () => {
		await store.save(ref, { mimeType: "text/plain", data: "first" });
		await store.save(ref, { mimeType: "text/plain", data: "second" });

		expect((await store.load(ref))?.data).toBe("second");
		expect((await store.load(ref, 0))?.data).toBe("first");
	});

	it("load of a nonexistent artifact returns null", async () => {
		expect(await store.load({ sessionId: "s1", name: "ghost" })).toBeNull();
	});

	it("listKeys is scoped per session", async () => {
		await store.save({ sessionId: "s1", name: "a.txt" }, { mimeType: "text/plain", data: "x" });
		await store.save({ sessionId: "s2", name: "b.txt" }, { mimeType: "text/plain", data: "y" });

		expect(await store.listKeys({ sessionId: "s1" })).toEqual(["a.txt"]);
	});

	it("listVersions returns the existing versions", async () => {
		await store.save(ref, { mimeType: "text/plain", data: "0" });
		await store.save(ref, { mimeType: "text/plain", data: "1" });
		expect(await store.listVersions(ref)).toEqual([0, 1]);
	});

	it("delete removes all versions", async () => {
		await store.save(ref, { mimeType: "text/plain", data: "0" });
		await store.delete(ref);
		expect(await store.load(ref)).toBeNull();
		expect(await store.listVersions(ref)).toEqual([]);
	});
});
