import type { ContextSnapshot } from "../../domain/diagnostics/context-snapshot";
import { CapturedContexts } from "../diagnostics/captured-contexts";
import type { AgentRunCommand } from "./agent-run-command";
import type { AskAgent } from "./ask-agent";
import { RunObservers } from "./run-observers";

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
export class ExplainAgent {
	public constructor(private readonly asking: AskAgent) {}

	public async handle(command: AgentRunCommand): Promise<readonly ContextSnapshot[]> {
		const captured = new CapturedContexts();
		await this.asking.handle(command, RunObservers.capturing(captured));
		return captured.all;
	}

	/** The snapshots and the failure together, for a run that did not get to the end. */
	public async attempt(command: AgentRunCommand): Promise<readonly ContextSnapshot[]> {
		const captured = new CapturedContexts();
		try {
			await this.asking.handle(command, RunObservers.capturing(captured));
		} catch {
			return captured.all;
		}
		return captured.all;
	}
}
