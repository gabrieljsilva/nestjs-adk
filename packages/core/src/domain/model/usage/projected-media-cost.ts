/** What a provider charges for one image crop, and the band every small image falls in. */
const TOKENS_PER_IMAGE = 258;

/** The usual ratio between characters and tokens, which is the unit a context is measured in. */
const CHARACTERS_PER_TOKEN = 4;

/**
 * What an attachment costs a context, projected rather than measured.
 *
 * The base64 length is the wrong number for this. A one megabyte image would read as a
 * million characters, take over the composition of the context and make compaction throw
 * away conversation to make room for something a provider charges as a few hundred
 * tokens. So an image is counted by the band providers actually bill, and the payload
 * size stays available separately for whoever needs the real bytes.
 *
 * It is a projection because nothing here decoded the image: the true cost depends on
 * dimensions this never reads. It is a declared floor, and it is named so nobody mistakes
 * it for something a provider reported.
 */
export class ProjectedMediaCost {
	private constructor(public readonly characters: number) {}

	public static ofImage(): ProjectedMediaCost {
		return ProjectedMediaCost.ofTokens(TOKENS_PER_IMAGE);
	}

	public static ofTokens(tokens: number): ProjectedMediaCost {
		return new ProjectedMediaCost(Math.max(0, Math.trunc(tokens)) * CHARACTERS_PER_TOKEN);
	}
}
