import { AdkError } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { GameNotFoundError } from "./game-not-found.error";

describe("GameNotFoundError", () => {
	it("carries the name that was asked for, so a run can correct itself", () => {
		const error = new GameNotFoundError("half-life-3");

		expect(error.slug).toBe("half-life-3");
		expect(error.message).toContain("half-life-3");
	});

	it("is an AdkError with a code a caller can branch on", () => {
		expect(new GameNotFoundError("half-life-3")).toBeInstanceOf(AdkError);
		expect(new GameNotFoundError("half-life-3").code).toBe("PLAYGROUND_GAME_NOT_FOUND");
	});
});
