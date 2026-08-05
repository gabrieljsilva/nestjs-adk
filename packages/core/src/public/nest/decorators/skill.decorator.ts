import { INLINE_SKILLS_METADATA } from "../../../adapters/nest/metadata-keys";

/** What `@Skill` declares. Without a mode it is on demand, so knowledge is not free weight. */
export interface SkillOptions {
	name: string;
	description: string;
	/** `always` composes it into the instruction; `on-demand` loads it by tool when asked. */
	mode?: "always" | "on-demand";
}

/**
 * Declares knowledge the agent has, on a method that returns it as text.
 *
 * The content is read once at boot. A skill is knowledge and not a query: reading it per
 * turn would make the stable prefix depend on when it was read, and a prefix that moves is
 * a cache that never hits.
 */
export function Skill(options: SkillOptions) {
	const normalized: SkillOptions = { ...options, mode: options.mode ?? "on-demand" };

	return (target: object, propertyKey?: string | symbol): void => {
		if (propertyKey === undefined) return;
		const owner = target.constructor;
		const declared: unknown[] = Reflect.getOwnMetadata(INLINE_SKILLS_METADATA, owner) ?? [];
		declared.push({ method: String(propertyKey), options: normalized });
		Reflect.defineMetadata(INLINE_SKILLS_METADATA, declared, owner);
	};
}
