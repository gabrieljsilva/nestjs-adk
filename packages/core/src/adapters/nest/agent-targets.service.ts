import { InvalidAgentMetadataError } from "./errors/invalid-agent-metadata.error";
import { AGENT_METADATA } from "./metadata/metadata-keys.token";

export class AgentTargets {
	public static readNames(value: readonly unknown[], providerName: string, decorator: string): readonly string[] {
		return value.map((target) => AgentTargets.readName(target, providerName, decorator));
	}

	private static readName(target: unknown, providerName: string, decorator: string): string {
		if (typeof target === "string") return target;
		if (typeof target !== "function") {
			throw new InvalidAgentMetadataError(
				providerName,
				`${decorator} accepts an agent name, a class declaring @Agent, or a function returning one. It was given ${AgentTargets.describe(target)}.`,
			);
		}
		return (
			AgentTargets.readDeclaredName(target, providerName, decorator) ??
			AgentTargets.nameOfReferenced(target, providerName, decorator)
		);
	}

	private static readDeclaredName(target: object, providerName: string, decorator: string): string | undefined {
		const metadata: unknown = Reflect.getMetadata(AGENT_METADATA, target);
		if (typeof metadata !== "object" || metadata === null) return undefined;
		const name = Reflect.get(metadata, "name");
		if (typeof name === "string" && name.length > 0) return name;
		throw new InvalidAgentMetadataError(
			providerName,
			`${decorator} was given ${AgentTargets.describe(target)}, which declares @Agent without a name.`,
		);
	}

	private static nameOfReferenced(target: object, providerName: string, decorator: string): string {
		if (AgentTargets.isClass(target)) {
			throw new InvalidAgentMetadataError(
				providerName,
				`${decorator} was given the class ${AgentTargets.describe(target)}, which does not declare @Agent.`,
			);
		}
		const resolved = AgentTargets.called(target, providerName, decorator);
		const name =
			typeof resolved === "function" ? AgentTargets.readDeclaredName(resolved, providerName, decorator) : undefined;
		if (name !== undefined) return name;
		throw new InvalidAgentMetadataError(
			providerName,
			`${decorator} was given a function that resolved to ${AgentTargets.describe(resolved)}, which does not declare @Agent.`,
		);
	}

	private static isClass(target: object): boolean {
		return Object.getOwnPropertyDescriptor(target, "prototype")?.writable === false;
	}

	private static called(target: object, providerName: string, decorator: string): unknown {
		try {
			return (target as () => unknown)();
		} catch (cause) {
			throw new InvalidAgentMetadataError(
				providerName,
				`${decorator} was given a function that threw when it was read: ${AgentTargets.buildMessage(cause)}`,
				cause,
			);
		}
	}

	private static buildMessage(cause: unknown): string {
		const message = cause instanceof Error ? cause.message || cause.name : String(cause);
		return message.length > 0 ? message : "it threw nothing that describes itself";
	}

	private static describe(value: unknown): string {
		const name = typeof value === "function" ? Reflect.get(value, "name") : undefined;
		return typeof name === "string" && name.length > 0 ? name : String(value);
	}
}
