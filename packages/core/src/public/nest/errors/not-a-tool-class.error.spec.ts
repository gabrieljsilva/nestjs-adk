import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { NotAToolClassError } from "./not-a-tool-class.error";

describe("NotAToolClassError", () => {
	it("names the class and carries a stable code", () => {
		const error = new NotAToolClassError("OrderService");

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("NOT_A_TOOL_CLASS");
		expect(error.candidate).toBe("OrderService");
		expect(error.message).toContain("OrderService");
	});
});
