import { describe, expect, it } from "vitest";
import { ContentDigest } from "../../common/digest/content-digest";
import { SessionId } from "../../common/identity/session-id";
import { SessionRevision } from "../../common/revision/session-revision";
import { UserMessage } from "../model/user-message";
import { ContextBlock } from "./context-block";
import { ContextCheckpoint } from "./context-checkpoint";
import { ContextComposition } from "./context-composition";

const SESSION = SessionId.from("s-1");
const DIGEST = ContentDigest.of("sha256", "abc123");
const OTHER_DIGEST = ContentDigest.of("sha256", "def456");

function checkpointOf(strategyVersion: number, digest = DIGEST): ContextCheckpoint {
	return new ContextCheckpoint(
		SESSION,
		SessionRevision.of(40),
		"oldest-first",
		strategyVersion,
		digest,
		[ContextBlock.summary(new UserMessage("earlier"), SessionRevision.of(40))],
		ContextComposition.empty(),
	);
}

describe("ContextCheckpoint", () => {
	it("is identified by session, covered revision and strategy version", () => {
		expect(checkpointOf(1).key).toBe("s-1:40:1");
	});

	it("is usable when the strategy, its version and the prefix digest all match", () => {
		expect(checkpointOf(1).isUsableAt("oldest-first", 1, DIGEST)).toBe(true);
	});

	it("is discarded when the prefix digest diverged", () => {
		expect(checkpointOf(1).isUsableAt("oldest-first", 1, OTHER_DIGEST)).toBe(false);
	});

	it("is discarded when it was written by a future strategy version", () => {
		expect(checkpointOf(2).isUsableAt("oldest-first", 1, DIGEST)).toBe(false);
	});

	it("is discarded when it was written by an older strategy version", () => {
		expect(checkpointOf(1).isUsableAt("oldest-first", 2, DIGEST)).toBe(false);
	});

	it("is discarded when another strategy wrote it", () => {
		expect(checkpointOf(1).isUsableAt("newest-first", 1, DIGEST)).toBe(false);
	});

	it("keeps the compacted blocks it replaced the prefix with", () => {
		expect(checkpointOf(1).blocks).toHaveLength(1);
	});
});
