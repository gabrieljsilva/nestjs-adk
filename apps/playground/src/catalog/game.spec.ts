import { describe, expect, it } from "vitest";
import { Game } from "./game";

describe("Game", () => {
	it("keeps what the store sells and how it is sold", () => {
		const nightreign = Game.of("elden-ring-nightreign", "Elden Ring Nightreign", "ps5", "action", 27_990, true);

		expect(nightreign.slug).toBe("elden-ring-nightreign");
		expect(nightreign.title).toBe("Elden Ring Nightreign");
		expect(nightreign.platform).toBe("ps5");
		expect(nightreign.genre).toBe("action");
		expect(nightreign.isDigital).toBe(true);
	});

	it("reads money in reais and keeps it in centavos", () => {
		const nightreign = Game.of("elden-ring-nightreign", "Elden Ring Nightreign", "ps5", "action", 27_990, true);

		expect(nightreign.priceCents).toBe(27_990);
		expect(nightreign.priceBrl).toBe(279.9);
	});

	it("multiplies in centavos, so nothing is lost on the way", () => {
		const nightreign = Game.of("elden-ring-nightreign", "Elden Ring Nightreign", "ps5", "action", 27_990, true);

		expect(nightreign.totalCentsFor(3)).toBe(83_970);
		expect(nightreign.totalCentsFor(0)).toBe(0);
	});
});
