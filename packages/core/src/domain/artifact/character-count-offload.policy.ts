import { OffloadDecision } from "./offload-decision.value-object";
import { OffloadPolicy } from "./offload.policy";

/** Large enough that ordinary results pass, small enough that one result cannot fill a window. */
const DEFAULT_THRESHOLD = 20_000;

/**
 * Moves a result out once it is longer than a declared number of characters, and says
 * whether what it moved is something the exploration tools can walk.
 *
 * JSON and text are explorable: an outline, a search and a pointer all mean something over
 * them, and each of the three answers in a fraction of the room the content itself would
 * take. Everything else is opaque, because the only honest thing to do with bytes whose
 * shape nothing here understands is hand them back as they are.
 *
 * Disabling it is a real answer. An application that would rather pay for a large prompt
 * than have the model make a second call says so, and nothing is moved out.
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

	/** True for the media types the exploration tools were written against, and nothing else. */
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
