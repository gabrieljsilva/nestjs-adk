import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { TRANSFERS_TO_METADATA } from "../constants";
import { TransfersTo } from "./transfers-to.decorator";

describe("TransfersTo", () => {
	it("records the agent names it was given", () => {
		@TransfersTo("billing", "escalation")
		class SupportAgent {}

		expect(Reflect.getMetadata(TRANSFERS_TO_METADATA, SupportAgent)).toEqual(["billing", "escalation"]);
	});

	it("records an empty list rather than nothing when it was used with no target", () => {
		@TransfersTo()
		class SupportAgent {}

		expect(Reflect.getMetadata(TRANSFERS_TO_METADATA, SupportAgent)).toEqual([]);
	});

	it("leaves a class that never used it without the metadata at all", () => {
		class SupportAgent {}

		expect(Reflect.getMetadata(TRANSFERS_TO_METADATA, SupportAgent)).toBeUndefined();
	});
});
