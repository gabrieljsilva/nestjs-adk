import { AgentName } from "../../../domain/agent/agent-name.value-object";
import type { RuntimeServices } from "../../../runtime/composition/runtime-services.value-object";
import type { StartedRuntime } from "../../adk-runtime.edge";
import { AgentHandle } from "../../agent/agent-handle.edge";

/**
 * Every agent the application declared, as handles it can hold. Reach for it from a class that
 * already extends something other than `AdkAgent`.
 *
 * A handle is created on demand and remembered, so two injections of the same agent are the
 * same object. Asking for a name nobody declared fails here, naming the ones that exist.
 */
export class AgentRegistry {
	private readonly handles = new Map<string, AgentHandle>();

	public constructor(private readonly host: StartedRuntime) {}

	public get names(): readonly string[] {
		return this.runtime.catalog.names;
	}

	public open(name: string): AgentHandle {
		const agent = this.runtime.catalog.findOrFail(AgentName.from(name)).name;
		const existing = this.handles.get(agent.value);
		if (existing !== undefined) return existing;

		const handle = new AgentHandle(agent, this.runtime);
		this.handles.set(agent.value, handle);
		return handle;
	}

	private get runtime(): RuntimeServices {
		return this.host.runtime;
	}
}
