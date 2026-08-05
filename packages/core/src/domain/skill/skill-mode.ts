/**
 * Whether a skill is always in the prompt or is loaded when it is needed.
 *
 * The difference is what it costs. An `always` skill is part of the stable prefix of
 * every call, which is cheap to cache and expensive to make long. An `on-demand` skill
 * shows only its name and description until the model asks for it, and then arrives as a
 * tool result in the place the conversation had reached.
 */
export class SkillMode {
	public static readonly ALWAYS = new SkillMode("always");
	public static readonly ON_DEMAND = new SkillMode("on-demand");

	private constructor(public readonly name: string) {}

	public static of(name: string): SkillMode | undefined {
		return [SkillMode.ALWAYS, SkillMode.ON_DEMAND].find((mode) => mode.name === name);
	}

	public get isAlways(): boolean {
		return this === SkillMode.ALWAYS;
	}

	public equals(other: SkillMode): boolean {
		return this.name === other.name;
	}

	public toString(): string {
		return this.name;
	}
}
