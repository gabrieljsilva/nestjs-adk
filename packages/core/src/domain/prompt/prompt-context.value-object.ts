import type { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import type { SessionId } from "../../common/identity/session-id.value-object";
import type { AgentName } from "../agent/agent-name.value-object";
import { SessionMetadata } from "../session/metadata/session-metadata.value-object";
import type { Actor } from "../tool/access/actor.value-object";

/**
 * What an agent knows about the run it is building a prompt for. There is no message and no
 * conversation here: the prompt is resolved once, before the first turn.
 *
 * `metadata` is what is durably true of this conversation, folded from the journal; `actor` is
 * who is asking now and with which claims, and is the same actor every tool of the run receives.
 */
export class PromptContext {
	public constructor(
		public readonly sessionId: SessionId,
		public readonly runId: AgentRunId,
		public readonly agent: AgentName,
		public readonly metadata: SessionMetadata = SessionMetadata.empty(),
		public readonly signal?: AbortSignal,
		public readonly actor?: Actor,
	) {}
}
