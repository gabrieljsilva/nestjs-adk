import { OffloadDecision } from "./offload-decision.value-object";
import { OffloadPolicy } from "./offload.policy";

const DEFAULT_THRESHOLD = 20_000;

/**
 * Moves a result out once it is longer than a declared number of characters.
 *
 * JSON and `text/*` are answered as explorable, because the exploration tools were written
 * against them; everything else is opaque. {@link disabled} moves nothing out and pays for
 * large results in the prompt.
 */
export class CharacterCountOffloadPolicy extends OffloadPolicy {
	public static readonly DEFAULT_THRESHOLD = DEFAULT_THRESHOLD;

	private constructor(private readonly threshold: number | undefined) {
		super();
	}

	public static byDefault(): CharacterCountOffloadPolicy {
		return new CharacterCountOffloadPolicy(DEFAULT_THRESHOLD);
	}

	public static above(threshold: number): CharacterCountOffloadPolicy {
		return new CharacterCountOffloadPolicy(Math.max(0, Math.trunc(threshold)));
	}

	public static disabled(): CharacterCountOffloadPolicy {
		return new CharacterCountOffloadPolicy(undefined);
	}

	public static isExplorableMediaType(mediaType: string | undefined): boolean {
		if (mediaType === undefined) return false;
		const normalized = mediaType.trim().toLowerCase();
		return normalized === "application/json" || normalized.endsWith("+json") || normalized.startsWith("text/");
	}

	public get isEnabled(): boolean {
		return this.threshold !== undefined;
	}

	public get thresholdCharacters(): number | undefined {
		return this.threshold;
	}

	public decide(characters: number, mediaType?: string): OffloadDecision {
		if (this.threshold === undefined || characters <= this.threshold) return OffloadDecision.INLINE;
		return CharacterCountOffloadPolicy.isExplorableMediaType(mediaType)
			? OffloadDecision.EXPLORABLE
			: OffloadDecision.OPAQUE;
	}
}
