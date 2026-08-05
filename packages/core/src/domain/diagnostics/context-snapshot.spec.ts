import { describe, expect, it } from "vitest";
import { AgentName } from "../agent/agent-name";
import { ModelIdentity } from "../model/model-identity";
import { ContextSegment } from "./context-segment";
import { ContextSnapshot } from "./context-snapshot";

const SUPPORT = AgentName.from("support");
const MODEL = ModelIdentity.of("acme", "primary");

function snapshot(): ContextSnapshot {
	return new ContextSnapshot(SUPPORT, MODEL, [
		new ContextSegment(ContextSegment.INSTRUCTIONS, "Be brief."),
		new ContextSegment(ContextSegment.TOOLS, "[]"),
		new ContextSegment(ContextSegment.CONVERSATION, "hi"),
	]);
}

describe("ContextSnapshot", () => {
	it("joins the sections in the order a provider receives them", () => {
		expect(snapshot().text).toBe("Be brief.[]hi");
		expect(snapshot().characters).toBe(13);
	});

	it("finds one section by name", () => {
		expect(snapshot().segment(ContextSegment.TOOLS)?.text).toBe("[]");
		expect(snapshot().segment("nothing")).toBeUndefined();
	});

	it("says which agent and which model the call belonged to", () => {
		expect(snapshot().agent.value).toBe("support");
		expect(snapshot().model.toString()).toBe("acme/primary");
	});
});
