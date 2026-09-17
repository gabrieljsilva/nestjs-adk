import { INLINE_SKILLS_METADATA } from "../../../adapters/nest/metadata/metadata-keys.token";

/** What `@Skill` declares. `always` composes it into the instruction; `on-demand`, the default, loads it by tool when asked. */
export interface SkillOptions {
	name: string;
	description: string;
	mode?: "always" | "on-demand";
}

/**
 * Declares knowledge the agent has, on a method that returns it as text. The content is read
 * once at boot: a skill is knowledge and not a query, and a prefix that moves per turn is a
 * cache that never hits.
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
