import { describe, expect, it } from "vitest";
import { AgentMetadata } from "./agent-metadata";
import { InvalidAgentMetadataError } from "./errors/invalid-agent-metadata.error";

describe("AgentMetadata", () => {
	it("takes a name and a description, which is the whole payload", () => {
		const metadata = AgentMetadata.from({ name: "support", description: "Answers first." }, "SupportAgent");

		expect(metadata.name).toBe("support");
		expect(metadata.description).toBe("Answers first.");
	});

	it("refuses metadata that is not an object at all", () => {
		expect(() => AgentMetadata.from("support", "SupportAgent")).toThrow(InvalidAgentMetadataError);
	});

	it("refuses a payload without a name or without a description", () => {
		expect(() => AgentMetadata.from({ description: "x" }, "SupportAgent")).toThrow(/name is missing/);
		expect(() => AgentMetadata.from({ name: "support" }, "SupportAgent")).toThrow(/description is missing/);
	});

	it("refuses subAgents at boot and says what replaced it", () => {
		const payload = { name: "support", description: "Answers first.", subAgents: ["billing"] };

		expect(() => AgentMetadata.from(payload, "SupportAgent")).toThrow(InvalidAgentMetadataError);
		expect(() => AgentMetadata.from(payload, "SupportAgent")).toThrow(/@TransfersTo/);
	});
});
