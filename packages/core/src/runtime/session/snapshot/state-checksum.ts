import { createHash } from "node:crypto";
import { ContentDigest } from "../../../common/digest/content-digest";
import type { SessionId } from "../../../common/identity/session-id";
import type { SessionState } from "../../../domain/session/session-state";
import { CanonicalStateSerializer } from "./canonical-state-serializer";

const ALGORITHM = "sha256";

/**
 * Fingerprints a projected state, tied to the session and the projector that built it.
 *
 * The session id and the projector version are part of the digest on purpose: a
 * snapshot written by an older projector, or restored into the wrong session, has to
 * fail the comparison rather than load and quietly mean something else.
 */
export class StateChecksum {
	public constructor(private readonly serializer: CanonicalStateSerializer = new CanonicalStateSerializer()) {}

	public of(sessionId: SessionId, projectorVersion: number, state: SessionState): ContentDigest {
		const canonical = JSON.stringify([sessionId.value, projectorVersion, this.serializer.serialize(state)]);
		return ContentDigest.of(ALGORITHM, createHash(ALGORITHM).update(canonical).digest("hex"));
	}
}
