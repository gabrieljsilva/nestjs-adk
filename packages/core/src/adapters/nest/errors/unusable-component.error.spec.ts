import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { UnusableComponentError } from "./unusable-component.error";

describe("UnusableComponentError", () => {
	it("names the provider and the reason, which is what the developer has to act on", () => {
		const error = new UnusableComponentError("SupportAgent", "it is request scoped.");

		expect(error.message).toContain("SupportAgent");
		expect(error.message).toContain("it is request scoped.");
	});

	it("is an ADK error, so an application catches it with everything else", () => {
		expect(new UnusableComponentError("SupportAgent", "reason")).toBeInstanceOf(AdkError);
		expect(new UnusableComponentError("SupportAgent", "reason").code).toBe("NEST_UNUSABLE_COMPONENT");
	});
});
