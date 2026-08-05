import { Logger } from "@nestjs/common";
import type { CallCost, RunCost } from "../pricing/pricing-types";
import type { AgentEvent, RunInput, TokenUsage } from "../types/events";

/** Max payload preview length below the "verbose" level (verbose logs full payloads). */
const PREVIEW_LENGTH = 160;

/**
 * Log level for agent runs, mirrors the Nest Logger levels and is cumulative:
 * - "info":    run start + run done (duration, final text, token usage), via logger.log
 * - "debug":   info + tool calls/results, via logger.debug
 * - "verbose": debug + intermediate LLM responses + full payloads (no truncation), via logger.verbose
 * Anomalies (model reroutes) and HITL pauses always log via logger.warn.
 * `true` is an alias for "info".
 */
export type LoggingOption = boolean | "info" | "debug" | "verbose" | undefined;

type LogLevel = "info" | "debug" | "verbose";

const LEVEL_WEIGHT: Record<LogLevel, number> = { info: 0, debug: 1, verbose: 2 };

/** Structured run logs via the Nest Logger, context `Adk:<agent>`. See LoggingOption for levels. */
export class RunLogger {
	public static create(option: LoggingOption, agentName: string): RunLogger | undefined {
		if (!option) return undefined;
		return new RunLogger(agentName, option === true ? "info" : option);
	}

	private readonly logger: Logger;
	private readonly startedAt = Date.now();

	private constructor(
		agentName: string,
		private readonly level: LogLevel,
	) {
		this.logger = new Logger(`Adk:${agentName}`);
	}

	public start(input: RunInput): void {
		const session = input.sessionId ?? "ephemeral";
		this.logger.log(`run start session=${session} user=${input.userId ?? "-"} message=${this.preview(input.message)}`);
	}

	public event(event: AgentEvent): void {
		switch (event.type) {
			case "run_start":
				return; // already covered by start(), which also has the input message
			case "tool_call":
				if (this.enabled("debug")) this.logger.debug(`tool call ${event.tool} args=${this.preview(json(event.args))}`);
				return;
			case "tool_result":
				if (this.enabled("debug")) {
					this.logger.debug(`tool result ${event.tool} result=${this.preview(json(event.result))}`);
				}
				return;
			case "llm_response":
				// no text still means a real call: the compaction summary arrives exactly like this
				if (this.enabled("verbose")) {
					this.logger.verbose(
						`llm response${event.model ? ` model=${event.model}` : ""}` +
							`${event.text ? ` text=${this.preview(event.text)}` : ""}` +
							`${usageSuffix(event.usage)}${callCostSuffix(event.cost)}`,
					);
				}
				return;
			case "agent_transfer":
				if (this.enabled("debug")) this.logger.debug(`agent transfer from=${event.from} to=${event.to}`);
				return;
			case "model_rerouted":
				this.logger.warn(`model rerouted from=${event.from} to=${event.to} reason=${event.reason}`);
				return;
			case "approval_required":
				this.logger.warn(
					`approval required tool=${event.tool} callId=${event.callId} args=${this.preview(json(event.args))}`,
				);
				return;
			case "reauth_required":
				// Warn like the other anomalies: an expired grant silently drops an integration from every
				// run that user makes, and at verbose it would only be visible to someone already looking.
				this.logger.warn(`re-authorization required source=${event.source} reason=${event.reason}`);
				return;
			case "final":
				this.logger.log(
					`run done in ${Date.now() - this.startedAt}ms text=${this.preview(event.text)}` +
						`${usageSuffix(event.usage)}${runCostSuffix(event.cost)}`,
				);
				return;
			default:
				if (this.enabled("verbose")) this.logger.verbose(json(event));
		}
	}

	/** Run aborted by a limit (maxIterations / tool breaker): always visible, like other anomalies. */
	public abort(error: Error, usage: TokenUsage): void {
		this.logger.warn(`run aborted after ${Date.now() - this.startedAt}ms: ${error.message}${usageSuffix(usage)}`);
	}

	/** Circuit-breaker escalation: one line per counted failure. */
	public toolFailure(tool: string, count: number, limit: number | undefined): void {
		if (this.enabled("debug")) this.logger.debug(`tool "${tool}" failed (${count}/${limit ?? "∞"} consecutive)`);
	}

	/**
	 * Arguments the schema rejected. Separate from toolFailure because the tool never ran: reading
	 * "failed" here would send someone debugging an integration that is working fine.
	 */
	public invalidArgs(tool: string, count: number, limit: number, issues: string): void {
		if (this.enabled("debug")) {
			this.logger.debug(`tool "${tool}" got invalid arguments (${count}/${limit} allowed): ${issues}`);
		}
	}

	private enabled(level: LogLevel): boolean {
		return LEVEL_WEIGHT[level] <= LEVEL_WEIGHT[this.level];
	}

	private preview(value: string): string {
		if (this.level === "verbose" || value.length <= PREVIEW_LENGTH) return value;
		return `${value.slice(0, PREVIEW_LENGTH)}... (+${value.length - PREVIEW_LENGTH} chars)`;
	}
}

function usageSuffix(usage: TokenUsage | undefined): string {
	if (!usage) return "";
	const cached = usage.cachedTokens != null ? ` cached=${usage.cachedTokens}` : "";
	return ` | tokens in=${usage.promptTokens} out=${usage.outputTokens}${cached} total=${usage.totalTokens}`;
}

function formatAmount(value: number, currency: string): string {
	// fixed notation: a fraction of a cent would otherwise print as 5.1e-5
	return `${value.toFixed(6)} ${currency}`;
}

function callCostSuffix(cost: CallCost | undefined): string {
	return cost ? ` | cost=${formatAmount(cost.amount, cost.currency)}` : "";
}

/** Models without a price are named, so a total that excludes them is never read as the whole bill. */
function runCostSuffix(cost: RunCost | undefined): string {
	if (!cost) return "";
	const unpriced = cost.unpriced.length > 0 ? ` unpriced=${cost.unpriced.join(",")}` : "";
	return ` | cost=${formatAmount(cost.total, cost.currency)}${unpriced}`;
}

function json(value: unknown): string {
	try {
		return JSON.stringify(value) ?? "undefined";
	} catch {
		return String(value);
	}
}
