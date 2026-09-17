import { createHash } from "node:crypto";
import { ContentDigest } from "./content-digest.value-object";

const ALGORITHM = "sha256";

export class TextDigest {
	public static fromText(text: string): ContentDigest {
		return new ContentDigest(ALGORITHM, createHash(ALGORITHM).update(text, "utf8").digest("hex"));
	}
}
