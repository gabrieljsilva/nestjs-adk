import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { EmptyVectorError } from "./empty-vector.error";

describe("EmptyVectorError", () => {
	it("keeps the reason, because an empty vector and a broken value are different bugs", () => {
		const error = new EmptyVectorError("it has no dimensions");

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("EMBEDDING_EMPTY_VECTOR");
		expect(error.reason).toBe("it has no dimensions");
		expect(error.message).toContain("no dimensions");
	});
});
