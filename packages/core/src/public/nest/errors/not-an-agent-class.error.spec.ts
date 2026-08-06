import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { NotAnAgentClassError } from "./not-an-agent-class.error";

describe("NotAnAgentClassError", () => {
	it("names the class and carries a stable code", () => {
		const error = new NotAnAgentClassError("OrderService");

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("NOT_AN_AGENT_CLASS");
		expect(error.candidate).toBe("OrderService");
		expect(error.message).toContain("OrderService");
	});
});
