import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteConnection } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { StoreDatabase } from "./store-database";

describe("StoreDatabase", () => {
	it("creates the tables the application reads from", () => {
		const database = new StoreDatabase();

		const names = database.connection
			.all("SELECT name FROM sqlite_master WHERE type = 'table'")
			.map((row) => Reflect.get(Object(row), "name"));

		expect(names).toEqual(expect.arrayContaining(["games", "orders", "tickets"]));
	});

	it("creates the session tables alongside its own, in one file", () => {
		const database = new StoreDatabase();

		const names = database.connection
			.all("SELECT name FROM sqlite_master WHERE type = 'table'")
			.map((row) => Reflect.get(Object(row), "name"));

		expect(names).toEqual(expect.arrayContaining(["sessions", "session_events"]));
	});

	it("opens the same file twice without failing on tables that already exist", () => {
		const directory = mkdtempSync(join(tmpdir(), "playground-db-"));
		const location = join(directory, "store.sqlite");

		try {
			const first = StoreDatabase.at(location);
			first.connection.run(
				"INSERT INTO tickets (id, order_id, reason, opened_at) VALUES (?, ?, ?, ?)",
				"T-1",
				"A-1042",
				"broken",
				"2026-08-05T00:00:00.000Z",
			);
			first.close();

			const second = StoreDatabase.at(location);

			expect(second.connection.all("SELECT id FROM tickets")).toHaveLength(1);
			second.close();
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("accepts a connection somebody else opened", () => {
		const connection = new SqliteConnection();

		const database = new StoreDatabase(connection);

		expect(database.connection).toBe(connection);
	});
});
