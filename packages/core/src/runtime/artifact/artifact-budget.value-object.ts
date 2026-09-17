import type { OffloadPolicy } from "../../domain/artifact/offload.policy";

/** The room an answer gets when the policy moves nothing out, so a budget always means something. */
const FALLBACK_BUDGET = 20_000;

/**
 * How much room an answer about an artifact is allowed to take in the context it goes back into.
 *
 * The number is the offload threshold itself, and that is the whole idea: an answer that
 * stays under the size the runtime moves results out at is an answer the runtime would not
 * have moved out. Without it, a tool written to help a model read something too large to
 * read would produce something too large to read, be offloaded, and hand back a placeholder
 * pointing at an artifact about an artifact.
 *
 * Fitting is always by dropping, never by summarizing. A search that found four hundred
 * matches answers with the first few and says it was cut, because a model that is told it
 * saw everything and did not will act on the half it was shown.
 */
export class ArtifactBudget {
	public constructor(public readonly characters: number) {}

	public static fromPolicy(policy: OffloadPolicy): ArtifactBudget {
		const threshold = policy.thresholdCharacters;
		return new ArtifactBudget(threshold === undefined || threshold <= 0 ? FALLBACK_BUDGET : threshold);
	}

	/** What an answer costs in the context, which is what it costs on the wire: its serialization. */
	public static measure(answer: Record<string, unknown>): number {
		return JSON.stringify(answer).length;
	}

	/**
	 * The same answer, with the one field that can grow cut down to whatever room is left.
	 *
	 * The named field is the content: the page of text, the matches, the value behind a
	 * pointer. Everything else is the frame, it is small and it is what the model needs to
	 * ask again, so the frame is measured first and the content gets the remainder.
	 */
	public fit(answer: Record<string, unknown>, field: string): Record<string, unknown> {
		const content = answer[field];
		const room = this.characters - ArtifactBudget.measure({ ...answer, [field]: emptyLike(content), truncated: true });
		const cut = room <= 0 ? emptyLike(content) : this.cut(content, room);
		const truncated = ArtifactBudget.measure({ [field]: cut }) !== ArtifactBudget.measure({ [field]: content });
		return truncated ? { ...answer, [field]: cut, truncated: true } : { ...answer, truncated: false };
	}

	private cut(content: unknown, room: number): unknown {
		if (typeof content === "string") return content.length <= room ? content : content.slice(0, room);
		if (!Array.isArray(content)) return this.cutValue(content, room);
		const kept: unknown[] = [];
		let spent = 2;
		for (const item of content) {
			const cost = JSON.stringify(item).length + 1;
			if (spent + cost > room) break;
			spent += cost;
			kept.push(item);
		}
		return kept;
	}

	/** A single value that does not fit is dropped whole: half a JSON object is not a value. */
	private cutValue(content: unknown, room: number): unknown {
		return JSON.stringify(content ?? null).length <= room ? content : null;
	}
}

/** What the field looks like once everything that could grow has been taken out of it. */
function emptyLike(content: unknown): unknown {
	if (typeof content === "string") return "";
	if (Array.isArray(content)) return [];
	return null;
}
