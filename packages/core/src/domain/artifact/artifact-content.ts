import type { ContentDigest } from "../../common/digest/content-digest";
import { TextDigest } from "../../common/digest/text-digest";

const DEFAULT_MEDIA_TYPE = "text/plain";

/**
 * The content of something too large to keep in a context, as text plus what it is.
 *
 * Text is the whole of the representation on purpose. Everything the runtime offloads
 * came from a model or is on its way back to one, and a format only a binary reader
 * understands would have to become text again before it could be read. An adapter that
 * stores bytes encodes them on the way in and decodes them on the way out.
 *
 * The digest covers the exact content, so an artifact that no longer hashes to the
 * reference it was handed is detectable rather than merely wrong.
 */
export class ArtifactContent {
	private constructor(
		public readonly text: string,
		public readonly mediaType: string,
	) {}

	public static of(text: string, mediaType: string = DEFAULT_MEDIA_TYPE): ArtifactContent {
		const normalized = mediaType.trim().toLowerCase();
		return new ArtifactContent(text, normalized.length === 0 ? DEFAULT_MEDIA_TYPE : normalized);
	}

	public get characters(): number {
		return this.text.length;
	}

	public digest(): ContentDigest {
		return TextDigest.of(this.text);
	}
}
