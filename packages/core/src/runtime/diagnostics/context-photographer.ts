import { CanonicalJson } from "../../common/serialization/canonical-json";
import type { AgentName } from "../../domain/agent/agent-name";
import type { ContextProjection } from "../../domain/context/context-projection";
import { ContextSegment } from "../../domain/diagnostics/context-segment";
import { ContextSnapshot } from "../../domain/diagnostics/context-snapshot";
import type { ModelIdentity } from "../../domain/model/model-identity";

/**
 * Turns a prepared context into the three strings a comparison can be run on.
 *
 * The serialization is canonical rather than pretty: two runs that sent the same thing
 * have to produce byte identical text, or every comparison reports a divergence that only
 * exists in how the object happened to be printed.
 *
 * The split matches what a provider caches on. Instructions and tool declarations are the
 * prefix, the conversation is what moves, and keeping them apart is what lets a report say
 * *where* two runs stopped agreeing instead of only that they did.
 */
export class ContextPhotographer {
	public of(agent: AgentName, model: ModelIdentity, projection: ContextProjection): ContextSnapshot {
		return new ContextSnapshot(agent, model, [
			new ContextSegment(ContextSegment.INSTRUCTIONS, this.instructionsOf(projection)),
			new ContextSegment(ContextSegment.TOOLS, this.toolsOf(projection)),
			new ContextSegment(ContextSegment.CONVERSATION, this.conversationOf(projection)),
		]);
	}

	private instructionsOf(projection: ContextProjection): string {
		return CanonicalJson.stringify({
			runtime: projection.runtimeInstructions?.text,
			agent: projection.agentPrompt?.text,
		});
	}

	private toolsOf(projection: ContextProjection): string {
		return CanonicalJson.stringify(
			projection.tools.map((tool) => ({
				name: tool.name,
				description: tool.description,
				parameters: tool.parameters,
			})),
		);
	}

	private conversationOf(projection: ContextProjection): string {
		return CanonicalJson.stringify(projection.messages.map((message) => ({ role: message.role, text: message.text })));
	}
}
