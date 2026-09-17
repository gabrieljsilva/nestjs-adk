import { createHash } from "node:crypto";
import { ContentDigest } from "../../../common/digest/content-digest.value-object";
import type { SessionId } from "../../../common/identity/session-id.value-object";
import type { SessionState } from "../../../domain/session/state/session-state.value-object";
import { CanonicalStateSerializer } from "./canonical-state-serializer.service";

const ALGORITHM = "sha256";

export class StateChecksum {
	public constructor(private readonly serializer: CanonicalStateSerializer = new CanonicalStateSerializer()) {}

	public of(sessionId: SessionId, projectorVersion: number, state: SessionState): ContentDigest {
		const canonical = JSON.stringify([sessionId.value, projectorVersion, this.serializer.serialize(state)]);
		return new ContentDigest(ALGORITHM, createHash(ALGORITHM).update(canonical).digest("hex"));
	}
}
