import { describe, expect, it } from "vitest";
import { InvalidAgentMetadataError } from "./errors/invalid-agent-metadata.error";
import { TransferMetadata } from "./transfer-metadata";

describe("TransferMetadata", () => {
	it("means nobody when the decorator was never used", () => {
		expect(TransferMetadata.from(undefined, "SupportAgent").targets).toEqual([]);
	});

	it("takes the names it was given, in the order they were declared", () => {
		expect(TransferMetadata.from(["billing", "escalation"], "SupportAgent").targets).toEqual(["billing", "escalation"]);
	});

	it("refuses anything that is not a list", () => {
		expect(() => TransferMetadata.from("billing", "SupportAgent")).toThrow(InvalidAgentMetadataError);
	});

	it("refuses classes, which is the mistake somebody migrating from subAgents makes", () => {
		class BillingAgent {}

		expect(() => TransferMetadata.from([BillingAgent], "SupportAgent")).toThrow(/agent names, not classes/);
	});

	it("names the provider that declared the wrong thing", () => {
		expect(() => TransferMetadata.from(42, "SupportAgent")).toThrow(/SupportAgent/);
	});
});
