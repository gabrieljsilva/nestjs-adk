import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { EmbedderNotDeclaredError } from "./embedder-not-declared.error";

describe("EmbedderNotDeclaredError", () => {
	it("names the option, because every cause of it is the same missing line", () => {
		const error = new EmbedderNotDeclaredError();

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("EMBEDDER_NOT_DECLARED");
		expect(error.message).toContain("AdkModule.forRoot");
	});
});
