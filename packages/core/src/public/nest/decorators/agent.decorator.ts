import { Injectable } from "@nestjs/common";
import { AGENT_METADATA } from "../../../adapters/nest/metadata/metadata-keys.token";
import type { AgentOptions } from "../agent/agent.options";

function markInjectable(target: object): void {
	const decorate = Injectable();
	decorate(Object(target));
}

/**
 * Declares an agent, and makes the class a provider so NestJS builds it with its dependencies.
 * What it writes is read once, after the container is ready.
 */
export function Agent(options: AgentOptions): ClassDecorator {
	return (target) => {
		Reflect.defineMetadata(AGENT_METADATA, options, target);
		markInjectable(target);
	};
}
