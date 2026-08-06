import { describe, expect, it } from "vitest";
import { Game } from "./game";

const nightreign = Game.of("elden-ring-nightreign", "Elden Ring Nightreign", "ps5", "acao", 27_990, true);

describe("Game", () => {
	it("keeps what the store sells and how it is sold", () => {
		expect(nightreign.slug).toBe("elden-ring-nightreign");
		expect(nightreign.title).toBe("Elden Ring Nightreign");
		expect(nightreign.platform).toBe("ps5");
		expect(nightreign.genre).toBe("acao");
		expect(nightreign.isDigital).toBe(true);
	});

	it("reads money in reais and keeps it in centavos", () => {
		expect(nightreign.priceCents).toBe(27_990);
		expect(nightreign.priceBrl).toBe(279.9);
	});

	it("multiplies in centavos, so nothing is lost on the way", () => {
		expect(nightreign.totalCentsFor(3)).toBe(83_970);
		expect(nightreign.totalCentsFor(0)).toBe(0);
	});
});
