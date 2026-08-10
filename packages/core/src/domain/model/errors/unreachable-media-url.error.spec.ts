import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { UnreachableMediaUrlError } from "./unreachable-media-url.error";

describe("UnreachableMediaUrlError", () => {
	it("carries a stable code", () => {
		expect(new UnreachableMediaUrlError("localhost").code).toBe("MEDIA_URL_UNREACHABLE");
	});

	it("names the host and the way out, because the failure is silent at the provider", () => {
		const error = new UnreachableMediaUrlError("localhost");

		expect(error.hostname).toBe("localhost");
		expect(error.message).toContain("localhost");
		expect(error.message).toContain("allowingPrivateHosts");
	});

	it("is an adk error", () => {
		expect(new UnreachableMediaUrlError("localhost")).toBeInstanceOf(AdkError);
	});
});
