import type { ContextSnapshot } from "../../../domain/diagnostics/context-snapshot.value-object";
import { CapturedContexts } from "../../diagnostics/captured-contexts.value-object";
import type { AgentRunCommand } from "../agent-run.command";
import { RunObservers } from "../journal/run-observers.value-object";
import type { AskAgentUseCase } from "./ask-agent.use-case";

export class ExplainAgentUseCase {
	public constructor(private readonly asking: AskAgentUseCase) {}

	public async execute(command: AgentRunCommand): Promise<readonly ContextSnapshot[]> {
		const captured = new CapturedContexts();
		await this.asking.execute(command, RunObservers.capturing(captured));
		return captured.all;
	}
}
