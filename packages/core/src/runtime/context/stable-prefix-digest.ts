import { createHash } from "node:crypto";
import { ContentDigest } from "../../common/digest/content-digest";
import { CanonicalJson } from "../../common/serialization/canonical-json";
import type { ContextProjection } from "../../domain/context/context-projection";

const ALGORITHM = "sha256";

/**
 * Fingerprints the part of a context that does not move.
 *
 * Instructions and tool declarations open every call and are what a provider side cache
 * matches on, so they are the prefix. The conversation is deliberately outside it:
 * compaction rewrites conversation and must leave this digest byte identical, and a
 * checkpoint whose digest no longer matches was summarised under a prompt or a toolset
 * that has since changed.
 */
export class StablePrefixDigest {
	public of(projection: ContextProjection): ContentDigest {
		const canonical = CanonicalJson.stringify({
			runtimeInstructions: projection.runtimeInstructions?.text,
			agentPrompt: projection.agentPrompt?.text,
			tools: projection.tools.map((tool) => ({
				name: tool.name,
				description: tool.description,
				parameters: tool.parameters,
			})),
		});
		return ContentDigest.of(ALGORITHM, createHash(ALGORITHM).update(canonical).digest("hex"));
	}
}
