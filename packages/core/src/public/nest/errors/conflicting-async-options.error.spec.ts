import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { ConflictingAsyncOptionsError } from "./conflicting-async-options.error";

describe("ConflictingAsyncOptionsError", () => {
	it("carries a stable code and the taxonomy's base", () => {
		const error = new ConflictingAsyncOptionsError(["useFactory", "useClass"]);

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("CONFLICTING_ASYNC_OPTIONS");
		expect(error.name).toBe("ConflictingAsyncOptionsError");
	});

	it("names the forms that collided, since which one to drop is the whole question", () => {
		const error = new ConflictingAsyncOptionsError(["useFactory", "useClass"]);

		expect(error.declared).toEqual(["useFactory", "useClass"]);
		expect(error.message).toContain("useFactory and useClass");
	});

	it("reads as a list when all three were declared", () => {
		const error = new ConflictingAsyncOptionsError(["useFactory", "useClass", "useExisting"]);

		expect(error.message).toContain("useFactory, useClass and useExisting");
	});
});
