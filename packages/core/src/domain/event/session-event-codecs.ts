import { AgentRunCancelledCodec } from "./codecs/agent-run-cancelled.codec";
import { AgentRunCompletedCodec } from "./codecs/agent-run-completed.codec";
import { AgentRunFailedCodec } from "./codecs/agent-run-failed.codec";
import { AgentRunStartedCodec } from "./codecs/agent-run-started.codec";
import { AgentRunSuspendedCodec } from "./codecs/agent-run-suspended.codec";
import { AgentTransferredCodec } from "./codecs/agent-transferred.codec";
import { AssistantMessageProducedCodec } from "./codecs/assistant-message-produced.codec";
import { DelegationCompletedCodec } from "./codecs/delegation-completed.codec";
import { DelegationStartedCodec } from "./codecs/delegation-started.codec";
import { ModelReroutedCodec } from "./codecs/model-rerouted.codec";
import { SessionCreatedCodec } from "./codecs/session-created.codec";
import { SkillActivatedCodec } from "./codecs/skill-activated.codec";
import { ToolApprovalDeniedCodec } from "./codecs/tool-approval-denied.codec";
import { ToolApprovalGrantedCodec } from "./codecs/tool-approval-granted.codec";
import { ToolApprovalRequestedCodec } from "./codecs/tool-approval-requested.codec";
import { ToolCallRequestedCodec } from "./codecs/tool-call-requested.codec";
import { ToolResultProducedCodec } from "./codecs/tool-result-produced.codec";
import { ToolSourceReauthRequiredCodec } from "./codecs/tool-source-reauth-required.codec";
import { UserMessageReceivedCodec } from "./codecs/user-message-received.codec";
import { SessionEventRegistry } from "./session-event-registry";

/**
 * Every codec this build knows about, in one registry.
 *
 * A new event type that is not listed here cannot be written to a durable journal and
 * cannot be shown to an observer, which is the point: the compiler will not notice a
 * missing codec, and a single place that has to be edited will.
 */
export class SessionEventCodecs {
	public static registry(): SessionEventRegistry {
		return new SessionEventRegistry()
			.register(new SessionCreatedCodec())
			.register(new UserMessageReceivedCodec())
			.register(new AssistantMessageProducedCodec())
			.register(new AgentRunStartedCodec())
			.register(new AgentRunCompletedCodec())
			.register(new AgentRunFailedCodec())
			.register(new AgentRunCancelledCodec())
			.register(new AgentRunSuspendedCodec())
			.register(new AgentTransferredCodec())
			.register(new ModelReroutedCodec())
			.register(new SkillActivatedCodec())
			.register(new ToolCallRequestedCodec())
			.register(new ToolResultProducedCodec())
			.register(new ToolApprovalRequestedCodec())
			.register(new ToolApprovalGrantedCodec())
			.register(new ToolApprovalDeniedCodec())
			.register(new ToolSourceReauthRequiredCodec())
			.register(new DelegationStartedCodec())
			.register(new DelegationCompletedCodec());
	}
}
