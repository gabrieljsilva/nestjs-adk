import { describe, expect, it } from "vitest";
import { UnsupportedStorageFeatureError } from "./unsupported-storage-feature.error";

describe("UnsupportedStorageFeatureError", () => {
	it("names the feature the adapter declared it does not do", () => {
		const error = new UnsupportedStorageFeatureError("context checkpoints");

		expect(error.code).toBe("UNSUPPORTED_STORAGE_FEATURE");
		expect(error.message).toContain("context checkpoints");
	});
});
