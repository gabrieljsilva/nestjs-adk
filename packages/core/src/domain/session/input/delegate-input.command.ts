import type { SessionId } from "../../../common/identity/session-id.value-object";
import type { AgentName } from "../../agent/agent-name.value-object";

/**
 * A delegation the developer decided, next to the one a model decides by calling the tool.
 *
 * `from` is what the declared `@DelegatesTo` edges are checked against, and the task travels
 * in full because the agent answering it does not read the conversation.
 */
export class DelegateInput {
	public constructor(
		public readonly sessionId: SessionId,
		public readonly from: AgentName,
		public readonly to: AgentName,
		public readonly task: string,
	) {}
}
