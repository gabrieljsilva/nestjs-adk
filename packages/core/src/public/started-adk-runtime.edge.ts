import { AgentName } from "../domain/agent/agent-name.value-object";
import type { RuntimeServices } from "../runtime/composition/runtime-services.value-object";
import type { AdkRuntime, RuntimeComponents } from "./adk-runtime.edge";
import { AgentHandle } from "./agent/agent-handle.edge";

/**
 * A running runtime, as an application without NestJS holds it. It answers handles rather
 * than repeating their verbs, so a question is asked through `findAgent(name)` exactly as it
 * is under NestJS.
 *
 * `stop` drains the runs still going, flushes what was observed and releases what the runtime
 * holds.
 */
export class StartedAdkRuntime {
	public constructor(private readonly host: AdkRuntime) {}

	public findAgent(name: AgentName | string): AgentHandle {
		return new AgentHandle(name instanceof AgentName ? name : AgentName.from(name), this.runtime);
	}

	public get agents(): readonly AgentHandle[] {
		return this.runtime.catalog.names.map((name) => new AgentHandle(AgentName.from(name), this.runtime));
	}

	public get runtime(): RuntimeServices {
		return this.host.runtime;
	}

	public get composed(): RuntimeComponents {
		return this.host.composed;
	}

	public async stop(): Promise<void> {
		await this.host.stop();
	}
}
