import { describe, expect, it } from "vitest";
import { StoredRow } from "../codec/stored-row";
import { SqliteConnection } from "./sqlite-connection";

describe("SqliteConnection", () => {
	it("opens a database that already has the shape the adapter needs", () => {
		const connection = new SqliteConnection();

		const tables = connection
			.all("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
			.map((row) => new StoredRow(row).text("name"));

		expect(tables).toContain("sessions");
		expect(tables).toContain("session_events");
		expect(tables).toContain("session_snapshots");
		connection.close();
	});

	it("hands back the first row, or nothing when there is none", () => {
		const connection = new SqliteConnection();
		connection.run(
			"INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			"s-1",
			"support",
			"ephemeral",
			"active",
			0,
			"t",
			"t",
			null,
		);

		expect(new StoredRow(connection.first("SELECT * FROM sessions WHERE id = ?", "s-1")).text("id")).toBe("s-1");
		expect(connection.first("SELECT * FROM sessions WHERE id = ?", "nope")).toBeUndefined();
		connection.close();
	});

	it("rolls a transaction back whole when its work throws", () => {
		const connection = new SqliteConnection();

		expect(() =>
			connection.transaction(() => {
				connection.run(
					"INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
					"s-1",
					"a",
					"ephemeral",
					"active",
					0,
					"t",
					"t",
					null,
				);
				throw new Error("halfway");
			}),
		).toThrow("halfway");

		expect(connection.all("SELECT * FROM sessions")).toEqual([]);
		connection.close();
	});

	it("keeps what a transaction that finished wrote", () => {
		const connection = new SqliteConnection();

		connection.transaction(() => {
			connection.run(
				"INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
				"s-1",
				"a",
				"ephemeral",
				"active",
				0,
				"t",
				"t",
				null,
			);
		});

		expect(connection.all("SELECT * FROM sessions")).toHaveLength(1);
		connection.close();
	});
});
