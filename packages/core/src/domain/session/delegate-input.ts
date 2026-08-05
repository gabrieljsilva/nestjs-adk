import type { SessionId } from "../../common/identity/session-id";
import type { AgentName } from "../agent/agent-name";

/**
 * A delegation the developer decided, next to the one a model decides by calling the tool.
 *
 * `from` is the agent doing the asking, which is what the declared edges are checked
 * against: code that could hand work to anything would make `@DelegatesTo` a suggestion.
 * The task travels in full because the agent answering it does not read the conversation.
 */
export class DelegateInput {
	public constructor(
		public readonly sessionId: SessionId,
		public readonly from: AgentName,
		public readonly to: AgentName,
		public readonly task: string,
	) {}
}
