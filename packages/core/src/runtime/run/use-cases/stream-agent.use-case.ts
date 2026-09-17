import type { ModelChunk } from "../../../domain/model/streaming/model-chunk.value-object";
import type { AgentResult } from "../../../domain/session/run/agent-result.value-object";
import { ChunkStream } from "../../stream/chunk-stream.service";
import type { AgentRunCommand } from "../agent-run.command";
import { RunObservers } from "../journal/run-observers.value-object";
import type { AskAgentUseCase } from "./ask-agent.use-case";

export class StreamAgentUseCase {
	public constructor(private readonly asking: AskAgentUseCase) {}

	public async *execute(command: AgentRunCommand): AsyncGenerator<ModelChunk, AgentResult> {
		const stream = new ChunkStream();
		const running = this.asking.execute(command, RunObservers.streaming(stream));
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
		settled.catch(() => undefined);

		for await (const chunk of stream.drain()) yield chunk;
		return await settled;
	}
}
