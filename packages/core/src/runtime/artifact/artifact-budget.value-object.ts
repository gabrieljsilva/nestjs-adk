import type { OffloadPolicy } from "../../domain/artifact/offload.policy";

const FALLBACK_BUDGET = 20_000;

export class ArtifactBudget {
	public constructor(public readonly characters: number) {}

	public static fromPolicy(policy: OffloadPolicy): ArtifactBudget {
		const threshold = policy.thresholdCharacters;
		return new ArtifactBudget(threshold === undefined || threshold <= 0 ? FALLBACK_BUDGET : threshold);
	}

	public static measure(answer: Record<string, unknown>): number {
		return JSON.stringify(answer).length;
	}

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

	private cutValue(content: unknown, room: number): unknown {
		return JSON.stringify(content ?? null).length <= room ? content : null;
	}
}

function emptyLike(content: unknown): unknown {
	if (typeof content === "string") return "";
	if (Array.isArray(content)) return [];
	return null;
}
