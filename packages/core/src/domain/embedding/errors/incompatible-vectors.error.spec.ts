import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { IncompatibleVectorsError } from "./incompatible-vectors.error";

describe("IncompatibleVectorsError", () => {
	it("names both dimensions, because the pair is the whole problem", () => {
		const error = new IncompatibleVectorsError(768, 1536);

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("EMBEDDING_INCOMPATIBLE_VECTORS");
		expect(error.message).toContain("768");
		expect(error.message).toContain("1536");
	});
});
