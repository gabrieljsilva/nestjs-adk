import { CanonicalJson } from "../../common/serialization/canonical-json.service";
import type { AgentName } from "../../domain/agent/agent-name.value-object";
import type { ContextProjection } from "../../domain/context/context-projection.value-object";
import { ContextSegment } from "../../domain/diagnostics/context-segment.value-object";
import { ContextSnapshot } from "../../domain/diagnostics/context-snapshot.value-object";
import type { ModelIdentity } from "../../domain/model/descriptor/model-identity.value-object";

export class ContextPhotographer {
	public of(agent: AgentName, model: ModelIdentity, projection: ContextProjection): ContextSnapshot {
		return new ContextSnapshot(agent, model, [
			new ContextSegment(ContextSegment.INSTRUCTIONS, this.formatInstructions(projection)),
			new ContextSegment(ContextSegment.TOOLS, this.formatTools(projection)),
			new ContextSegment(ContextSegment.CONVERSATION, this.formatConversation(projection)),
		]);
	}

	private formatInstructions(projection: ContextProjection): string {
		return CanonicalJson.stringify({
			runtime: projection.runtimeInstructions?.text,
			agent: projection.agentPrompt?.text,
		});
	}

	private formatTools(projection: ContextProjection): string {
		return CanonicalJson.stringify(
			projection.tools.map((tool) => ({
				name: tool.name,
				description: tool.description,
				parameters: tool.parameters,
			})),
		);
	}

	private formatConversation(projection: ContextProjection): string {
		return CanonicalJson.stringify(projection.messages.map((message) => ({ role: message.role, text: message.text })));
	}
}
