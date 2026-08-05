import type { ContentDigest } from "../../common/digest/content-digest";
import { TextDigest } from "../../common/digest/text-digest";
import { SkillMode } from "./skill-mode";

/**
 * One body of knowledge an agent can carry, and how it carries it.
 *
 * The content is the whole of the skill; there is no compact variant here, because a
 * skill that summarizes itself differently on every call would break the byte identical
 * prefix that provider side caching depends on.
 *
 * The scope says how long an activation lasts. A skill activated for the run is gone on
 * the next command; one activated for the session stays until the session does.
 */
export class SkillDefinition {
	private constructor(
		public readonly name: string,
		public readonly description: string,
		public readonly content: string,
		public readonly mode: SkillMode,
		public readonly scope: "run" | "session",
	) {}

	public static always(name: string, description: string, content: string): SkillDefinition {
		return new SkillDefinition(name, description, content, SkillMode.ALWAYS, "session");
	}

	public static onDemand(
		name: string,
		description: string,
		content: string,
		scope: "run" | "session" = "run",
	): SkillDefinition {
		return new SkillDefinition(name, description, content, SkillMode.ON_DEMAND, scope);
	}

	public get isAlways(): boolean {
		return this.mode.isAlways;
	}

	/** Pins the exact content an activation carried, so a later replay can tell it changed. */
	public digest(): ContentDigest {
		return TextDigest.of(this.content);
	}
}
