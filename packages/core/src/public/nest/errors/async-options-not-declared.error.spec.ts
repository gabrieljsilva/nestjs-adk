import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { AsyncOptionsNotDeclaredError } from "./async-options-not-declared.error";

describe("AsyncOptionsNotDeclaredError", () => {
	it("names the three forms, because the fix is picking one of them", () => {
		const error = new AsyncOptionsNotDeclaredError();

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("ASYNC_OPTIONS_NOT_DECLARED");
		expect(error.name).toBe("AsyncOptionsNotDeclaredError");
		expect(error.message).toContain("useFactory");
		expect(error.message).toContain("useClass");
		expect(error.message).toContain("useExisting");
	});
});
