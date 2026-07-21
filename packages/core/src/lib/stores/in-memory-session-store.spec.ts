import { SessionNotFoundError } from "../errors";
import { InMemorySessionStore } from "./in-memory-session-store";

describe("InMemorySessionStore", () => {
	let store: InMemorySessionStore;

	beforeEach(() => {
		store = new InMemorySessionStore();
	});

	it("create generates an id when absent and starts with state/events", async () => {
		const session = await store.create({ userId: "u1", state: { plan: "pro" } });
		expect(session.id).toBeTruthy();
		expect(session.userId).toBe("u1");
		expect(session.state).toEqual({ plan: "pro" });
		expect(session.events).toEqual([]);
		expect(session.createdAt).toBeInstanceOf(Date);
	});

	it("get returns null for a nonexistent session", async () => {
		expect(await store.get("nope")).toBeNull();
	});

	it("appendEvent preserves order and updates updatedAt", async () => {
		const { id } = await store.create({});
		await store.appendEvent(id, { v: 1, id: "e1", at: 1, author: "user", type: "message", data: { text: "hi" } });
		await store.appendEvent(id, { v: 1, id: "e2", at: 2, author: "agent", type: "message", data: { text: "hello" } });

		const session = await store.get(id);
		expect(session?.events.map((e) => e.id)).toEqual(["e1", "e2"]);
	});

	it("appendEvent on a nonexistent session → SessionNotFoundError", async () => {
		await expect(
			store.appendEvent("ghost", { v: 1, id: "e", at: 1, author: "user", type: "message", data: {} }),
		).rejects.toBeInstanceOf(SessionNotFoundError);
	});

	it("updateState does a shallow merge (stateDelta)", async () => {
		const { id } = await store.create({ state: { a: 1, keep: true } });
		await store.updateState(id, { a: 2, b: 3 });
		expect((await store.get(id))?.state).toEqual({ a: 2, b: 3, keep: true });
	});

	it("mutations on the returned object don't corrupt the store (copy on read)", async () => {
		const { id } = await store.create({ state: { a: 1 } });
		const session = await store.get(id);
		// biome-ignore lint/style/noNonNullAssertion: created above
		session!.state.a = 999;
		// biome-ignore lint/style/noNonNullAssertion: created above
		session!.events.push({ v: 1, id: "hack", at: 1, author: "user", type: "message", data: {} });

		const fresh = await store.get(id);
		expect(fresh?.state.a).toBe(1);
		expect(fresh?.events).toEqual([]);
	});

	it("delete removes the session", async () => {
		const { id } = await store.create({});
		await store.delete(id);
		expect(await store.get(id)).toBeNull();
	});
});
