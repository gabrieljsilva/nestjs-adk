import { describe, expect, it } from "vitest";
import { DelegationMetadata } from "./delegation-metadata";
import { InvalidAgentMetadataError } from "./errors/invalid-agent-metadata.error";

describe("DelegationMetadata", () => {
	it("means nobody when the decorator was never used", () => {
		expect(DelegationMetadata.from(undefined, "SupportAgent").targets).toEqual([]);
	});

	it("takes the names it was given", () => {
		expect(DelegationMetadata.from(["researcher"], "SupportAgent").targets).toEqual(["researcher"]);
	});

	it("refuses anything that is not a list of names", () => {
		expect(() => DelegationMetadata.from({ researcher: true }, "SupportAgent")).toThrow(InvalidAgentMetadataError);
		expect(() => DelegationMetadata.from([class Researcher {}], "SupportAgent")).toThrow(/not classes/);
	});
});
