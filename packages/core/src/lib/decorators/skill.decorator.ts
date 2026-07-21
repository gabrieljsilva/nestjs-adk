import { Injectable } from "@nestjs/common";
import { INLINE_SKILLS_METADATA, SKILL_METADATA } from "../constants";
import type { SkillOptions } from "../types/options";

export interface InlineSkillMetadata {
	method: string;
	options: Required<Pick<SkillOptions, "name" | "description" | "mode">>;
}

/**
 * Declares a skill (domain instructions queryable on demand).
 * - On a CLASS (shared): extends AdkSkill, becomes a provider.
 * - On an agent METHOD (exclusive): the method returns the content.
 * default mode: 'on-demand'.
 */
export function Skill(options: SkillOptions) {
	const normalized = { ...options, mode: options.mode ?? ("on-demand" as const) };

	return (target: object, propertyKey?: string | symbol): void => {
		if (propertyKey !== undefined) {
			const ctor = target.constructor;
			const inline: InlineSkillMetadata[] = Reflect.getOwnMetadata(INLINE_SKILLS_METADATA, ctor) ?? [];
			inline.push({ method: String(propertyKey), options: normalized });
			Reflect.defineMetadata(INLINE_SKILLS_METADATA, inline, ctor);
			return;
		}

		Reflect.defineMetadata(SKILL_METADATA, normalized, target);
		Injectable()(target as Parameters<ReturnType<typeof Injectable>>[0]);
	};
}
