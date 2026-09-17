import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { InvalidAgentMetadataError } from "../errors/invalid-agent-metadata.error";
import { DelegationMetadata } from "./delegation-metadata.value-object";
import { AGENT_METADATA } from "./metadata-keys.token";

describe("DelegationMetadata", () => {
	it("means nobody when the decorator was never used", () => {
		expect(DelegationMetadata.from(undefined, "SupportAgent").targets).toEqual([]);
	});

	it("takes the names it was given", () => {
		expect(DelegationMetadata.from(["researcher"], "SupportAgent").targets).toEqual(["researcher"]);
	});

	it("resolves a class down to the name the catalog knows", () => {
		class ResearcherAgent {}
		Reflect.defineMetadata(AGENT_METADATA, { name: "researcher", description: "Looks things up." }, ResearcherAgent);

		expect(DelegationMetadata.from([ResearcherAgent], "SupportAgent").targets).toEqual(["researcher"]);
	});

	it("refuses anything that is not a list of targets", () => {
		expect(() => DelegationMetadata.from({ researcher: true }, "SupportAgent")).toThrow(InvalidAgentMetadataError);
		expect(() => DelegationMetadata.from([class Researcher {}], "SupportAgent")).toThrow(/does not declare @Agent/);
	});
});
