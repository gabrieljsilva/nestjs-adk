import { AdkError } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { MemberNotFoundError } from "./member-not-found.error";

describe("MemberNotFoundError", () => {
	it("carries a stable code and the library's base", () => {
		const error = new MemberNotFoundError("stranger@nebula.games");

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("PLAYGROUND_MEMBER_NOT_FOUND");
		expect(error.name).toBe("MemberNotFoundError");
	});

	it("names whoever the club could not place", () => {
		const error = new MemberNotFoundError("stranger@nebula.games");

		expect(error.owner).toBe("stranger@nebula.games");
		expect(error.message).toContain("stranger@nebula.games");
	});
});
