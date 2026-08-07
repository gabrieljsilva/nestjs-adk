import { InvalidAgentMetadataError } from "./errors/invalid-agent-metadata.error";
import { AGENT_METADATA } from "./metadata-keys";

/**
 * Turns what an edge decorator was handed into the names the catalog is keyed by.
 *
 * Resolution happens here and not in the decorator, and that is the whole reason a target
 * may be a function. A decorator runs while its own class is being defined, which is exactly
 * when the other end of a cycle is still `undefined`; this runs during the scan, when every
 * module has finished loading and both classes exist.
 */
export class AgentTargets {
	public static namesOf(value: readonly unknown[], providerName: string, decorator: string): readonly string[] {
		return value.map((target) => AgentTargets.nameOf(target, providerName, decorator));
	}

	private static nameOf(target: unknown, providerName: string, decorator: string): string {
		if (typeof target === "string") return target;
		if (typeof target !== "function") {
			throw new InvalidAgentMetadataError(
				providerName,
				`${decorator} accepts an agent name, a class declaring @Agent, or a function returning one. It was given ${AgentTargets.describe(target)}.`,
			);
		}
		return (
			AgentTargets.declaredNameOf(target, providerName, decorator) ??
			AgentTargets.nameOfReferenced(target, providerName, decorator)
		);
	}

	/**
	 * The name a decorated class carries, or nothing when this function is a reference to one.
	 *
	 * A class that declares `@Agent` with no usable name is answered here rather than passed on
	 * as a reference. It is plainly meant to be the target, so reporting a decorator it does
	 * have as missing would send the reader to the wrong line.
	 */
	private static declaredNameOf(target: object, providerName: string, decorator: string): string | undefined {
		const metadata: unknown = Reflect.getMetadata(AGENT_METADATA, target);
		if (typeof metadata !== "object" || metadata === null) return undefined;
		const name = Reflect.get(metadata, "name");
		if (typeof name === "string" && name.length > 0) return name;
		throw new InvalidAgentMetadataError(
			providerName,
			`${decorator} was given ${AgentTargets.describe(target)}, which declares @Agent without a name.`,
		);
	}

	/**
	 * A function that carries no declaration is a reference to one, and is read now.
	 *
	 * A class is recognised before the call rather than by catching what the call throws.
	 * Calling a class raises a type error that says nothing about agents, and treating every
	 * throw as that one case is how an unresolved cycle gets reported as a missing decorator,
	 * which is the single mistake this form exists to help with.
	 */
	private static nameOfReferenced(target: object, providerName: string, decorator: string): string {
		if (AgentTargets.isClass(target)) {
			throw new InvalidAgentMetadataError(
				providerName,
				`${decorator} was given the class ${AgentTargets.describe(target)}, which does not declare @Agent.`,
			);
		}
		const resolved = AgentTargets.called(target, providerName, decorator);
		const name =
			typeof resolved === "function" ? AgentTargets.declaredNameOf(resolved, providerName, decorator) : undefined;
		if (name !== undefined) return name;
		throw new InvalidAgentMetadataError(
			providerName,
			`${decorator} was given a function that resolved to ${AgentTargets.describe(resolved)}, which does not declare @Agent.`,
		);
	}

	/** Every class has a prototype it cannot reassign, and no plain function, arrow or bound function does. */
	private static isClass(target: object): boolean {
		return Object.getOwnPropertyDescriptor(target, "prototype")?.writable === false;
	}

	/** Whatever the reference threw is the only thing that says why, so it travels as the cause. */
	private static called(target: object, providerName: string, decorator: string): unknown {
		try {
			return (target as () => unknown)();
		} catch (cause) {
			throw new InvalidAgentMetadataError(
				providerName,
				`${decorator} was given a function that threw when it was read: ${AgentTargets.messageOf(cause)}`,
				cause,
			);
		}
	}

	/** An error with an empty message still has a name, and something thrown that is not an error has neither. */
	private static messageOf(cause: unknown): string {
		const message = cause instanceof Error ? cause.message || cause.name : String(cause);
		return message.length > 0 ? message : "it threw nothing that describes itself";
	}

	private static describe(value: unknown): string {
		const name = typeof value === "function" ? Reflect.get(value, "name") : undefined;
		return typeof name === "string" && name.length > 0 ? name : String(value);
	}
}
