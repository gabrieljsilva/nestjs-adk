import type { ModelChunk } from "../../domain/model/model-chunk";
import type { AgentResult } from "../../domain/session/agent-result";
import { ChunkStream } from "../stream/chunk-stream";
import type { AgentRunCommand } from "./agent-run-command";
import type { AskAgent } from "./ask-agent";
import { RunObservers } from "./run-observers";

/**
 * The same command as `ask`, watched while it happens.
 *
 * There is one run, one journal and one result: streaming adds a reader, not a second way
 * of running an agent. The chunks are exactly the ones the executor aggregates into the
 * answer, so for a given script the text of `ask` and the concatenation of what this
 * yielded are the same string by construction rather than by agreement.
 *
 * The result is the generator's return value, not a chunk. A caller that only wants the
 * text reads the chunks; a caller that also needs the session id, the status and what is
 * awaiting a decision takes what comes back at the end.
 */
export class StreamAgent {
	public constructor(private readonly asking: AskAgent) {}

	public async *handle(command: AgentRunCommand): AsyncGenerator<ModelChunk, AgentResult> {
		const stream = new ChunkStream();
		const running = this.asking.handle(command, RunObservers.streaming(stream));
		const settled = running.then(
			(result) => {
				stream.close();
				return result;
			},
			(error: unknown) => {
				stream.close();
				throw error;
			},
		);
		// A caller that walks away mid stream must not crash the process with an unhandled rejection.
		settled.catch(() => undefined);

		for await (const chunk of stream.drain()) yield chunk;
		return await settled;
	}
}
