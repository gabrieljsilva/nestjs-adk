import { createHash } from "node:crypto";
import { ContentDigest } from "./content-digest.value-object";

const ALGORITHM = "sha256";

/**
 * Fingerprints text, and is the only place in the runtime that decides how.
 *
 * One algorithm, named in the result. Two callers that hash the same string get the
 * same digest, which is what makes a fingerprint usable as an identity check across a
 * process boundary rather than only inside one.
 */
export class TextDigest {
	public static fromText(text: string): ContentDigest {
		return new ContentDigest(ALGORITHM, createHash(ALGORITHM).update(text, "utf8").digest("hex"));
	}
}
