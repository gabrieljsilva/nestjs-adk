import { describe, expect, it } from "vitest";
import { ArtifactId } from "../../common/identity/artifact-id";
import { SessionId } from "../../common/identity/session-id";
import { ArtifactContent } from "./artifact-content";
import { ArtifactReference } from "./artifact-reference";
import { OffloadedContent } from "./offloaded-content";

const reference = ArtifactReference.of(
	ArtifactId.from("a-1"),
	SessionId.from("s-1"),
	ArtifactContent.of("a very long report"),
);

describe("OffloadedContent", () => {
	it("is the text itself when nothing had to move", () => {
		const content = OffloadedContent.inline("short answer");

		expect(content.text).toBe("short answer");
		expect(content.wasOffloaded).toBe(false);
		expect(content.reference).toBeUndefined();
	});

	it("becomes a placeholder that names what to ask for", () => {
		const content = OffloadedContent.offloaded(reference);

		expect(content.wasOffloaded).toBe(true);
		expect(content.text).toContain("a-1");
		expect(content.reference).toBe(reference);
	});
});
