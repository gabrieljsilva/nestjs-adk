import type { ContextSnapshot } from "../../../domain/diagnostics/context-snapshot.value-object";
import { CapturedContexts } from "../../diagnostics/captured-contexts.value-object";
import type { AgentRunCommand } from "../agent-run.command";
import { RunObservers } from "../journal/run-observers.value-object";
import type { AskAgentUseCase } from "./ask-agent.use-case";

/**
 * Runs the command and hands back what every model call was actually given.
 *
 * It runs the real thing rather than a rehearsal, because the question it answers is what
 * the provider received, and a rehearsal that skipped the model would only be able to
 * answer what the runtime intended to send. The session, the journal and the cost are the
 * same as any other run.
 *
 * A run that failed is still worth looking at, so the snapshots taken before the failure
 * come back with it rather than being thrown away with the error.
 */
export class ExplainAgentUseCase {
	public constructor(private readonly asking: AskAgentUseCase) {}

	public async execute(command: AgentRunCommand): Promise<readonly ContextSnapshot[]> {
		const captured = new CapturedContexts();
		await this.asking.execute(command, RunObservers.capturing(captured));
		return captured.all;
	}

	/** The snapshots and the failure together, for a run that did not get to the end. */
	public async attempt(command: AgentRunCommand): Promise<readonly ContextSnapshot[]> {
		const captured = new CapturedContexts();
		try {
			await this.asking.execute(command, RunObservers.capturing(captured));
		} catch {
			return captured.all;
		}
		return captured.all;
	}
}
