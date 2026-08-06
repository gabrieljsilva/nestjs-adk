import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { AgentMetadata } from "./agent-metadata";
import { Agent } from "./decorators/agent.decorator";
import { NotAnAgentClassError } from "./errors/not-an-agent-class.error";

@Agent({ name: "billing", description: "Money." })
class BillingAgent {}

class PlainService {}

describe("AgentMetadata", () => {
	it("reads the name and description the decorator wrote", () => {
		const declaration = AgentMetadata.findOrFail(BillingAgent);

		expect(declaration.name).toBe("billing");
		expect(declaration.description).toBe("Money.");
	});

	it("finds nothing on a class that is not an agent", () => {
		expect(AgentMetadata.find(PlainService)).toBeUndefined();
	});

	it("finds nothing on a value that is not a class", () => {
		expect(AgentMetadata.find("billing")).toBeUndefined();
	});

	it("fails naming the class when asked for a declaration it does not have", () => {
		expect(() => AgentMetadata.findOrFail(PlainService)).toThrow(NotAnAgentClassError);
		expect(() => AgentMetadata.findOrFail(PlainService)).toThrow(/PlainService/);
	});
});
