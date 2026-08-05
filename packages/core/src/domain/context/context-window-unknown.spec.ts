import { describe, expect, it } from "vitest";
import { ModelIdentity } from "../model/model-identity";
import { ContextWindowUnknown } from "./context-window-unknown";

describe("ContextWindowUnknown", () => {
	it("names the model it is about", () => {
		expect(new ContextWindowUnknown(ModelIdentity.of("acme", "m-1")).model.model).toBe("m-1");
	});

	it("says that measuring continues and refusing does not", () => {
		const message = new ContextWindowUnknown(ModelIdentity.of("acme", "m-1")).message;

		expect(message).toContain("acme/m-1");
		expect(message).toContain("measured");
	});
});
