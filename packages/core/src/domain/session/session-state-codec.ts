import { AgentRunId } from "../../common/identity/agent-run-id";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { SessionRevision } from "../../common/revision/session-revision";
import { AgentName } from "../agent/agent-name";
import { ModelIdentity } from "../model/model-identity";
import { ModelUsage } from "../model/model-usage";
import { PromptMeasurement } from "../model/prompt-measurement";
import { PendingCall } from "./pending-call";
import { PendingTurn } from "./pending-turn";
import { SessionState } from "./session-state";
import { StateValues } from "./state-values";

/**
 * Turns a projected state into something a database can hold, and back.
 *
 * A snapshot is only ever a shortcut, so this has one duty: what comes back has to mean
 * exactly what went in, or the checksum that guards it will refuse it and the journal will
 * be replayed. That is the safety net, and it is why this can be simple: a decode that
 * drifts costs a replay, never a wrong session.
 */
export class SessionStateCodec {
	public encode(state: SessionState): Record<string, unknown> {
		return {
			revision: state.revision.value,
			values: state.values.entries().map(([key, value]) => [key, value]),
			activeAgent: state.activeAgent?.value,
			lastPrompt: this.encodePrompt(state),
			pendingTurn: this.encodeTurn(state),
		};
	}

	public decode(payload: Readonly<Record<string, unknown>>): SessionState {
		return SessionState.restored(
			SessionRevision.of(this.number(payload.revision)),
			StateValues.of(this.pairs(payload.values)),
			this.optionalText(payload.activeAgent) === undefined ? undefined : AgentName.from(this.text(payload.activeAgent)),
			this.decodePrompt(payload.lastPrompt),
			this.decodeTurn(payload.pendingTurn),
		);
	}

	private encodePrompt(state: SessionState): Record<string, unknown> | undefined {
		const prompt = state.lastPrompt;
		if (prompt === undefined) return undefined;
		return {
			characters: prompt.characters,
			inputTokens: prompt.usage.inputTokens,
			outputTokens: prompt.usage.outputTokens,
			cachedInputTokens: prompt.usage.reportsCaching ? prompt.usage.cachedInputTokens : undefined,
			provider: prompt.model?.provider,
			model: prompt.model?.model,
		};
	}

	private decodePrompt(value: unknown): PromptMeasurement | undefined {
		if (typeof value !== "object" || value === null) return undefined;
		const cached = Reflect.get(value, "cachedInputTokens");
		const provider = Reflect.get(value, "provider");
		const model = Reflect.get(value, "model");
		const usage = ModelUsage.of(
			this.number(Reflect.get(value, "inputTokens")),
			this.number(Reflect.get(value, "outputTokens")),
			typeof cached === "number" ? cached : undefined,
		);
		const identity =
			typeof provider === "string" && typeof model === "string" ? ModelIdentity.of(provider, model) : undefined;
		return PromptMeasurement.from(usage, this.number(Reflect.get(value, "characters")), identity);
	}

	private encodeTurn(state: SessionState): Record<string, unknown> | undefined {
		const turn = state.pendingTurn;
		if (turn === undefined) return undefined;
		return {
			runId: turn.runId.value,
			calls: turn.calls.map((call) => ({
				callId: call.callId.value,
				toolName: call.toolName,
				args: call.args,
				effect: call.effect,
				decision: call.decision,
				reason: call.reason,
			})),
		};
	}

	private decodeTurn(value: unknown): PendingTurn | undefined {
		if (typeof value !== "object" || value === null) return undefined;
		const calls = Reflect.get(value, "calls");
		if (!Array.isArray(calls)) return undefined;
		return PendingTurn.of(
			AgentRunId.from(this.text(Reflect.get(value, "runId"))),
			calls.map((call) => this.decodeCall(call)),
		);
	}

	private decodeCall(value: unknown): PendingCall {
		const args = Reflect.get(Object(value), "args");
		const decision = Reflect.get(Object(value), "decision");
		return new PendingCall(
			ToolCallId.from(this.text(Reflect.get(Object(value), "callId"))),
			this.text(Reflect.get(Object(value), "toolName")),
			typeof args === "object" && args !== null ? { ...args } : {},
			this.optionalText(Reflect.get(Object(value), "effect")),
			decision === "granted" || decision === "denied" ? decision : undefined,
			this.optionalText(Reflect.get(Object(value), "reason")),
		);
	}

	private pairs(value: unknown): ReadonlyArray<readonly [string, string]> {
		if (!Array.isArray(value)) return [];
		const entries: Array<readonly [string, string]> = [];
		for (const entry of value) {
			if (!Array.isArray(entry)) continue;
			const key = entry[0];
			const held = entry[1];
			if (typeof key === "string" && typeof held === "string") entries.push([key, held]);
		}
		return entries;
	}

	private number(value: unknown): number {
		return typeof value === "number" && Number.isFinite(value) ? value : 0;
	}

	private text(value: unknown): string {
		return typeof value === "string" ? value : "";
	}

	private optionalText(value: unknown): string | undefined {
		return typeof value === "string" ? value : undefined;
	}
}
