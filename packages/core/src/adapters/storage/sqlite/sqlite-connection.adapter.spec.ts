import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { StoredRow } from "../codec/stored-row.record";
import { SqliteConnection } from "./sqlite-connection.adapter";

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

	it("adds the artifact columns a file written by an older build lacks, and marks its images as bytes", () => {
		const location = join(mkdtempSync(join(tmpdir(), "adk-sqlite-")), "old.db");
		const old = new DatabaseSync(location);
		old.exec(
			"CREATE TABLE session_artifacts (session_id TEXT NOT NULL, artifact_id TEXT NOT NULL, media_type TEXT NOT NULL, content TEXT NOT NULL, PRIMARY KEY (session_id, artifact_id))",
		);
		old.exec(
			"INSERT INTO session_artifacts VALUES ('s-1', 'a-1', 'image/png', 'iVBORw0KGgo='), ('s-1', 'a-2', 'text/plain', 'hi')",
		);
		old.close();

		const connection = new SqliteConnection(location);
		const rows = connection
			.all("SELECT artifact_id, encoding, name FROM session_artifacts ORDER BY artifact_id")
			.map((row) => new StoredRow(row));

		expect(rows.map((row) => row.text("encoding"))).toEqual(["base64", "utf-8"]);
		expect(rows.map((row) => row.optionalText("name"))).toEqual([undefined, undefined]);
		connection.close();
	});

	it("hands back the first row, or nothing when there is none", () => {
		const connection = new SqliteConnection();
		connection.run(
			"INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?)",
			"s-1",
			"support",

			"active",
			0,
			"t",
			"t",
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
					"INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?)",
					"s-1",
					"a",

					"active",
					0,
					"t",
					"t",
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
				"INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?)",
				"s-1",
				"a",

				"active",
				0,
				"t",
				"t",
			);
		});

		expect(connection.all("SELECT * FROM sessions")).toHaveLength(1);
		connection.close();
	});
});
