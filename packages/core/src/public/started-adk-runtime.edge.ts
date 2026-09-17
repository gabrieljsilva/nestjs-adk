import { AgentName } from "../domain/agent/agent-name.value-object";
import type { RuntimeServices } from "../runtime/composition/runtime-services.value-object";
import type { AdkRuntime, RuntimeComponents } from "./adk-runtime.edge";
import { AgentHandle } from "./agent/agent-handle.edge";

/**
 * A running runtime, as an application without NestJS holds it.
 *
 * It answers handles rather than repeating their verbs. `AgentHandle` is already the
 * surface of one agent, thirteen verbs deep, and `AdkAgent` stopped mirroring it for the
 * reason that applies here too: two copies of thirteen methods drift, and the copy an
 * editor offers is the one nobody updated. So `ask`, `stream`, `approve` and `reject` are
 * reached the same way in both worlds, through the handle of the agent being asked, and
 * what this class adds is the two things a handle cannot answer: which agents exist, and
 * when the process is done with them.
 */
export class StartedAdkRuntime {
	public constructor(private readonly host: AdkRuntime) {}

	/** The agent that answers under this name, whether it was asked for as text or parsed. */
	public findAgent(name: AgentName | string): AgentHandle {
		return new AgentHandle(name instanceof AgentName ? name : AgentName.from(name), this.runtime);
	}

	/** Every agent this runtime answers for, in the order they were declared. */
	public get agents(): readonly AgentHandle[] {
		return this.runtime.catalog.names.map((name) => new AgentHandle(AgentName.from(name), this.runtime));
	}

	/** Everything the public surface does not cover, for an application that composes its own. */
	public get runtime(): RuntimeServices {
		return this.host.runtime;
	}

	/** What the runtime was composed against, including whatever the defaults supplied. */
	public get composed(): RuntimeComponents {
		return this.host.composed;
	}

	/** Drains the runs still going, flushes what was observed, and releases what the runtime holds. */
	public async stop(): Promise<void> {
		await this.host.stop();
	}
}
