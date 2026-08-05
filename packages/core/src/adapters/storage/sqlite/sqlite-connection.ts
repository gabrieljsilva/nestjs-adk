import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
	id TEXT PRIMARY KEY,
	root_agent TEXT NOT NULL,
	mode TEXT NOT NULL,
	status TEXT NOT NULL,
	revision INTEGER NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	owner TEXT
);
CREATE TABLE IF NOT EXISTS session_events (
	session_id TEXT NOT NULL,
	revision INTEGER NOT NULL,
	event_id TEXT NOT NULL,
	type TEXT NOT NULL,
	schema_version INTEGER NOT NULL,
	occurred_at TEXT NOT NULL,
	run_id TEXT NOT NULL,
	agent_id TEXT NOT NULL,
	correlation_id TEXT NOT NULL,
	causation_id TEXT,
	payload TEXT NOT NULL,
	PRIMARY KEY (session_id, revision)
);
CREATE UNIQUE INDEX IF NOT EXISTS session_events_by_id ON session_events (session_id, event_id);
CREATE TABLE IF NOT EXISTS session_snapshots (
	session_id TEXT PRIMARY KEY,
	revision INTEGER NOT NULL,
	projector_version INTEGER NOT NULL,
	checksum_algorithm TEXT NOT NULL,
	checksum_value TEXT NOT NULL,
	state TEXT NOT NULL
);
`;

/**
 * One SQLite database, opened once and shaped before anybody writes to it.
 *
 * The driver is `node:sqlite`, which ships with the runtime: a durable adapter that costs
 * a native dependency is a durable adapter most people will not install.
 *
 * Everything here is synchronous because the driver is. That is what makes a transaction
 * around an append actually atomic: no other work can interleave between the statements,
 * so optimistic concurrency is decided by the revision and never by scheduling.
 */
export class SqliteConnection {
	private readonly database: DatabaseSync;

	public constructor(location = ":memory:") {
		this.database = new DatabaseSync(location);
		this.database.exec("PRAGMA journal_mode = WAL");
		this.database.exec("PRAGMA foreign_keys = ON");
		this.database.exec(SCHEMA);
	}

	public run(sql: string, ...parameters: readonly SqliteValue[]): void {
		this.database.prepare(sql).run(...parameters);
	}

	public all(sql: string, ...parameters: readonly SqliteValue[]): readonly unknown[] {
		return this.database.prepare(sql).all(...parameters);
	}

	public first(sql: string, ...parameters: readonly SqliteValue[]): unknown {
		return this.all(sql, ...parameters).at(0);
	}

	/** All or nothing: a batch that fails halfway leaves the journal exactly as it was. */
	public transaction<T>(work: () => T): T {
		this.database.exec("BEGIN IMMEDIATE");
		try {
			const result = work();
			this.database.exec("COMMIT");
			return result;
		} catch (error) {
			this.database.exec("ROLLBACK");
			throw error;
		}
	}

	public close(): void {
		this.database.close();
	}
}

/** What a statement accepts as a bound parameter, which is what SQLite itself stores. */
export type SqliteValue = string | number | null;
