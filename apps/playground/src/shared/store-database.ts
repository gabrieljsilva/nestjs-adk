import { SqliteConnection } from "@nestjs-adk/core";
import { Injectable } from "@nestjs/common";

/**
 * The tables this application owns.
 *
 * The sessions of the runtime live in the same file, created by `SqliteSessionStorage`
 * over the same connection: an application that keeps its conversations and its data in
 * two databases has to answer what happens when one of them is restored and the other
 * is not.
 */
const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS games (
		slug TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		platform TEXT NOT NULL,
		genre TEXT NOT NULL,
		price_cents INTEGER NOT NULL,
		is_digital INTEGER NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS orders (
		id TEXT PRIMARY KEY,
		customer TEXT NOT NULL,
		product TEXT NOT NULL,
		total_cents INTEGER NOT NULL,
		plan TEXT NOT NULL,
		delivered_on TEXT NOT NULL,
		status TEXT NOT NULL,
		refunded_cents INTEGER NOT NULL DEFAULT 0
	)`,
	`CREATE TABLE IF NOT EXISTS tickets (
		id TEXT PRIMARY KEY,
		order_id TEXT NOT NULL,
		reason TEXT NOT NULL,
		session_id TEXT,
		opened_at TEXT NOT NULL
	)`,
];

/**
 * The application's database, shaped before anybody reads from it.
 *
 * It is a provider so repositories can be injected with it, and it holds the connection
 * rather than extending it: the connection belongs to whoever opened the file, which for
 * a durable run is the module and not this.
 */
@Injectable()
export class StoreDatabase {
	public constructor(public readonly connection: SqliteConnection = new SqliteConnection()) {
		for (const statement of SCHEMA) connection.run(statement);
	}

	/** A database on disk, which is what surviving a restart requires. */
	public static at(location: string): StoreDatabase {
		return new StoreDatabase(new SqliteConnection(location));
	}

	public close(): void {
		this.connection.close();
	}
}
