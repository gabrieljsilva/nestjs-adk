import { ToolApprovalDeniedCodec } from "./codecs/approval/tool-approval-denied.codec";
import { ToolApprovalGrantedCodec } from "./codecs/approval/tool-approval-granted.codec";
import { ToolApprovalRequestedCodec } from "./codecs/approval/tool-approval-requested.codec";
import { SessionMetadataDeletedCodec } from "./codecs/metadata/session-metadata-deleted.codec";
import { SessionMetadataSetCodec } from "./codecs/metadata/session-metadata-set.codec";
import { AgentRunCancelledCodec } from "./codecs/run/agent-run-cancelled.codec";
import { AgentRunCompletedCodec } from "./codecs/run/agent-run-completed.codec";
import { AgentRunFailedCodec } from "./codecs/run/agent-run-failed.codec";
import { AgentRunStartedCodec } from "./codecs/run/agent-run-started.codec";
import { AgentRunSuspendedCodec } from "./codecs/run/agent-run-suspended.codec";
import { ModelReroutedCodec } from "./codecs/run/model-rerouted.codec";
import { SkillActivatedCodec } from "./codecs/run/skill-activated.codec";
import { AssistantMessageProducedCodec } from "./codecs/session/assistant-message-produced.codec";
import { SessionCreatedCodec } from "./codecs/session/session-created.codec";
import { UserMessageReceivedCodec } from "./codecs/session/user-message-received.codec";
import { ToolCallRequestedCodec } from "./codecs/tool/tool-call-requested.codec";
import { ToolResultProducedCodec } from "./codecs/tool/tool-result-produced.codec";
import { ToolSourceReauthRequiredCodec } from "./codecs/tool/tool-source-reauth-required.codec";
import { AgentTransferredCodec } from "./codecs/transfer/agent-transferred.codec";
import { DelegationCompletedCodec } from "./codecs/transfer/delegation-completed.codec";
import { DelegationStartedCodec } from "./codecs/transfer/delegation-started.codec";
import { SessionEventRegistry } from "./session-event-registry.service";

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
			.register(new SessionMetadataSetCodec())
			.register(new SessionMetadataDeletedCodec())
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
