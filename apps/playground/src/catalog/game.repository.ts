import { Injectable } from "@nestjs/common";
import { StoreDatabase } from "../shared/store-database";
import { StoreRow } from "../shared/store-row";
import { Game } from "./game";

const COLUMNS = "slug, title, platform, genre, price_cents, is_digital";

/** Enough for a customer to choose from, and short enough to fit in one answer. */
const SEARCH_LIMIT = 8;

/** Rows in, `Game` out. Nothing here decides anything about a price. */
@Injectable()
export class GameRepository {
	public constructor(private readonly database: StoreDatabase) {}

	/** Ignores a title the catalog already has, so seeding twice is not an error. */
	public save(game: Game): void {
		this.database.connection.run(
			`INSERT OR IGNORE INTO games (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`,
			game.slug,
			game.title,
			game.platform,
			game.genre,
			game.priceCents,
			game.isDigital ? 1 : 0,
		);
	}

	public all(): readonly Game[] {
		return this.database.connection.all(`SELECT ${COLUMNS} FROM games ORDER BY title`).map((row) => this.gameOf(row));
	}

	public search(term: string): readonly Game[] {
		const pattern = `%${term.toLowerCase()}%`;
		return this.database.connection
			.all(
				`SELECT ${COLUMNS} FROM games
				 WHERE lower(title) LIKE ? OR lower(platform) LIKE ? OR lower(genre) LIKE ?
				 ORDER BY title LIMIT ?`,
				pattern,
				pattern,
				pattern,
				SEARCH_LIMIT,
			)
			.map((row) => this.gameOf(row));
	}

	public findBySlug(slug: string): Game | undefined {
		const row = this.database.connection.first(`SELECT ${COLUMNS} FROM games WHERE slug = ?`, slug);
		return row === undefined ? undefined : this.gameOf(row);
	}

	private gameOf(source: unknown): Game {
		const row = new StoreRow(source);
		return Game.of(
			row.text("slug"),
			row.text("title"),
			row.text("platform"),
			row.text("genre"),
			row.integer("price_cents"),
			row.flag("is_digital"),
		);
	}
}
