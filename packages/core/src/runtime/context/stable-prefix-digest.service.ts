import { createHash } from "node:crypto";
import { ContentDigest } from "../../common/digest/content-digest.value-object";
import { CanonicalJson } from "../../common/serialization/canonical-json.service";
import type { ContextProjection } from "../../domain/context/context-projection.value-object";

const ALGORITHM = "sha256";

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
		return new ContentDigest(ALGORITHM, createHash(ALGORITHM).update(canonical).digest("hex"));
	}
}
