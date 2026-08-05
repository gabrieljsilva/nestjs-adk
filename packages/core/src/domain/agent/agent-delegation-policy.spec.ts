import { describe, expect, it } from "vitest";
import { AgentDelegationPolicy } from "./agent-delegation-policy";
import { AgentName } from "./agent-name";

const RESEARCHER = AgentName.from("researcher");
const TRANSLATOR = AgentName.from("translator");

describe("AgentDelegationPolicy", () => {
	it("delegates to nobody by default", () => {
		expect(AgentDelegationPolicy.none().isEmpty).toBe(true);
		expect(AgentDelegationPolicy.none().describe()).toBe("none");
	});

	it("allows exactly what it was given", () => {
		const policy = AgentDelegationPolicy.to([RESEARCHER]);

		expect(policy.allows(RESEARCHER)).toBe(true);
		expect(policy.allows(TRANSLATOR)).toBe(false);
	});

	it("compares by the normalized name", () => {
		expect(AgentDelegationPolicy.to([AgentName.from("Research Agent")]).allows(AgentName.from("research-agent"))).toBe(
			true,
		);
	});

	it("names the targets for whoever shows them to a model", () => {
		expect(AgentDelegationPolicy.to([RESEARCHER, TRANSLATOR]).describe()).toBe("researcher, translator");
	});

	it("keeps its own copy of the list it was handed", () => {
		const targets = [RESEARCHER];
		const policy = AgentDelegationPolicy.to(targets);
		targets.push(TRANSLATOR);

		expect(policy.allows(TRANSLATOR)).toBe(false);
	});
});
