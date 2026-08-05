import { describe, expect, it } from "vitest";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { ModelIdentity } from "./model-identity";
import { ModelResponse } from "./model-response";
import { ModelUsage } from "./model-usage";
import { ToolCall } from "./tool-call";

const MODEL = ModelIdentity.of("acme", "m-1");
const call = new ToolCall(ToolCallId.from("call-1"), "refund", {});

describe("ModelResponse", () => {
	it("carries the model that answered", () => {
		expect(new ModelResponse(MODEL, "hi").model.toString()).toBe("acme/m-1");
	});

	it("reports words and work apart", () => {
		const response = new ModelResponse(MODEL, "one moment", [call]);

		expect(response.hasText).toBe(true);
		expect(response.hasToolCalls).toBe(true);
	});

	it("is a turn of work alone when the model only asked for tools", () => {
		const response = new ModelResponse(MODEL, "", [call]);

		expect(response.hasText).toBe(false);
		expect(response.isEmpty).toBe(false);
	});

	it("reports an empty turn, which is a provider answering badly", () => {
		expect(new ModelResponse(MODEL, "").isEmpty).toBe(true);
	});

	it("reports no usage when the provider reported none", () => {
		expect(new ModelResponse(MODEL, "hi").usage.totalTokens).toBe(0);
	});

	it("keeps the usage the provider reported", () => {
		const response = new ModelResponse(MODEL, "hi", [], ModelUsage.of(100, 40));

		expect(response.usage.totalTokens).toBe(140);
	});

	it("carries a structured output only when one was produced", () => {
		expect(new ModelResponse(MODEL, "hi").structuredOutput).toBeUndefined();
		expect(new ModelResponse(MODEL, "{}", [], ModelUsage.none(), "stop", { ok: true }).structuredOutput).toEqual({
			ok: true,
		});
	});
});
