import { describe, expect, it } from "vitest";
import { ContentDigest } from "../../../common/digest/content-digest.value-object";
import { SessionId } from "../../../common/identity/session-id.value-object";
import { SessionRevision } from "../../../common/revision/session-revision.value-object";
import { SessionSnapshot } from "./session-snapshot.value-object";
import { SessionState } from "./session-state.value-object";

const digest = new ContentDigest("sha256", "abc");
const other = new ContentDigest("sha256", "def");

function snapshot(revision: number, version = 1): SessionSnapshot {
	return new SessionSnapshot(
		SessionId.from("s-1"),
		new SessionRevision(revision),
		version,
		SessionState.initial(),
		digest,
	);
}

describe("SessionSnapshot", () => {
	it("is usable when projector, checksum and revision all agree", () => {
		expect(snapshot(10).isUsableAt(1, new SessionRevision(20), digest)).toBe(true);
	});

	it("is usable when it sits exactly at the head", () => {
		expect(snapshot(20).isUsableAt(1, new SessionRevision(20), digest)).toBe(true);
	});

	it("is refused when a different projector wrote it", () => {
		expect(snapshot(10, 2).isUsableAt(1, new SessionRevision(20), digest)).toBe(false);
	});

	it("is refused when the checksum does not match the state it claims", () => {
		expect(snapshot(10).isUsableAt(1, new SessionRevision(20), other)).toBe(false);
	});

	it("is refused when it is ahead of the journal head", () => {
		expect(snapshot(30).isUsableAt(1, new SessionRevision(20), digest)).toBe(false);
	});
});
