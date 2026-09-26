const CENTS_PER_REAL = 100;

export class Game {
	private constructor(
		public readonly slug: string,
		public readonly title: string,
		public readonly platform: string,
		public readonly genre: string,
		public readonly priceCents: number,
		public readonly isDigital: boolean,
	) {}

	public static of(
		slug: string,
		title: string,
		platform: string,
		genre: string,
		priceCents: number,
		isDigital: boolean,
	): Game {
		return new Game(slug, title, platform, genre, priceCents, isDigital);
	}

	public get priceBrl(): number {
		return this.priceCents / CENTS_PER_REAL;
	}

	public totalCentsFor(quantity: number): number {
		return this.priceCents * quantity;
	}
}
