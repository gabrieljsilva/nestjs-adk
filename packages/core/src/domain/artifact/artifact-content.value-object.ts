import type { ContentDigest } from "../../common/digest/content-digest.value-object";
import { TextDigest } from "../../common/digest/text-digest.service";

const DEFAULT_MEDIA_TYPE = "text/plain";

/**
 * The content of something too large to keep in a context, as text plus what it is.
 *
 * Text is the whole of the representation: a store that keeps bytes encodes them on the way in
 * and decodes them on the way out. The media type is normalized to lower case and defaults to
 * `text/plain`, and the digest covers the exact text.
 */
export class ArtifactContent {
	public readonly mediaType: string;

	public constructor(
		public readonly text: string,
		mediaType: string = DEFAULT_MEDIA_TYPE,
	) {
		const normalized = mediaType.trim().toLowerCase();
		this.mediaType = normalized.length === 0 ? DEFAULT_MEDIA_TYPE : normalized;
	}

	public get characters(): number {
		return this.text.length;
	}

	public digest(): ContentDigest {
		return TextDigest.fromText(this.text);
	}
}
