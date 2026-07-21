import { AdkError } from "./adk.error";

class SampleError extends AdkError {
	public readonly code = "SAMPLE";
}

describe("AdkError", () => {
	it("carries the subclass name, stable code, and cause", () => {
		const cause = new Error("root");
		const error = new SampleError("boom", { cause });

		expect(error).toBeInstanceOf(AdkError);
		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe("SampleError");
		expect(error.code).toBe("SAMPLE");
		expect(error.message).toBe("boom");
		expect(error.cause).toBe(cause);
	});
});
