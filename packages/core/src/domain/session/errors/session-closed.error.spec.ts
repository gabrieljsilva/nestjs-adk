import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { SessionClosedError } from "./session-closed.error";

describe("SessionClosedError", () => {
	it("names the session and the status that refused the command", () => {
		const error = new SessionClosedError("s-1", "closed");

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("SESSION_CLOSED");
		expect(error.message).toContain("s-1");
		expect(error.message).toContain("closed");
	});
});
