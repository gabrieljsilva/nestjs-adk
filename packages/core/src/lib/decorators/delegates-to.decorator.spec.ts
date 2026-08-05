import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { DELEGATES_TO_METADATA, TRANSFERS_TO_METADATA } from "../constants";
import { DelegatesTo } from "./delegates-to.decorator";

describe("DelegatesTo", () => {
	it("records the agent names it was given", () => {
		@DelegatesTo("researcher")
		class SupportAgent {}

		expect(Reflect.getMetadata(DELEGATES_TO_METADATA, SupportAgent)).toEqual(["researcher"]);
	});

	it("does not write where the transfer decorator writes, because they mean different things", () => {
		@DelegatesTo("researcher")
		class SupportAgent {}

		expect(Reflect.getMetadata(TRANSFERS_TO_METADATA, SupportAgent)).toBeUndefined();
	});
});
