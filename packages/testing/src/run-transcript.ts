import { type PublishedEvent, SessionEventConsumer } from "@nestjs-adk/core";

/** How much of a long answer is worth reading in a test log. */
const LIMIT = 220;

/**
 * Prints the conversation as it happens, which is the only way to read a paid suite.
 *
 * A run against a real provider passes or fails on what the model actually said, and a
 * green tick says nothing about that. This turns the event stream into a transcript: the
 * question, every tool the model reached for with the arguments it chose, what came back,
 * and the sentence it finally wrote.
 *
 * It is a consumer like any other, so it costs no call and sees exactly what an
 * application observing its own runs would see.
 */
export class RunTranscript extends SessionEventConsumer {
	public readonly name = "run-transcript";
	private readonly agentsByRun = new Map<string, string>();
	private readonly toolsByCall = new Map<string, string>();
	private readonly delegatedRuns = new Map<string, string>();

	public constructor(private readonly print: (line: string) => void = console.log) {
		super();
	}

	public async consume(event: PublishedEvent): Promise<void> {
		this.remember(event);
		const line = this.lineOf(event);
		if (line !== undefined) this.print(line);
	}

	private lineOf(event: PublishedEvent): string | undefined {
		const payload = event.payload;
		const agent = this.agentOf(event);
		if (event.type === "session.user-message-received") {
			const delegated = this.delegatedRuns.get(event.correlation.runId.value);
			return delegated === undefined
				? `  › ${this.textIn(payload, "text")}`
				: `  ⤳ ${delegated}: ${this.textIn(payload, "text")}`;
		}
		if (event.type === "run.assistant-message-produced") {
			const text = this.textIn(payload, "text");
			return text.length === 0 ? undefined : `  ‹ ${agent}: ${text}`;
		}
		if (event.type === "tool.call-requested") {
			return `  ⚙ ${agent}: ${this.textIn(payload, "toolName")}(${this.shorten(JSON.stringify(payload.args ?? {}))})`;
		}
		if (event.type === "tool.result-produced") {
			return `  ↩ ${agent}: ${this.textIn(payload, "toolName")} ${this.shorten(JSON.stringify(payload.output ?? {}))}`;
		}
		if (event.type === "tool.approval-requested") {
			return `  ⏸ ${this.textIn(payload, "toolName")}`;
		}
		if (event.type === "tool.approval-granted") {
			return `  ✓ ${this.toolOf(payload)}${this.personIn(payload, "approvedBy")}`;
		}
		if (event.type === "tool.approval-denied") {
			return `  × ${this.toolOf(payload)}${this.personIn(payload, "deniedBy")}: ${this.textIn(payload, "reason")}`;
		}
		if (event.type === "agent.transferred") {
			return `  → ${this.textIn(payload, "from")} → ${this.textIn(payload, "to")}`;
		}
		if (event.type === "delegation.started") {
			return `  ⤳ ${agent} → ${this.textIn(payload, "toAgent")}`;
		}
		return undefined;
	}

	private remember(event: PublishedEvent): void {
		if (event.type === "run.started") {
			this.agentsByRun.set(event.correlation.runId.value, this.textIn(event.payload, "agent"));
		}
		if (event.type === "tool.call-requested") {
			this.toolsByCall.set(this.textIn(event.payload, "callId"), this.textIn(event.payload, "toolName"));
		}
		if (event.type === "delegation.started") {
			const childRunId = event.payload.childRunId;
			const toAgent = event.payload.toAgent;
			if (typeof childRunId === "string" && typeof toAgent === "string") {
				this.delegatedRuns.set(childRunId, toAgent);
			}
		}
	}

	private agentOf(event: PublishedEvent): string {
		return this.agentsByRun.get(event.correlation.runId.value) ?? "unknown";
	}

	private toolOf(payload: Readonly<Record<string, unknown>>): string {
		const named = payload.toolName;
		if (typeof named === "string" && named.length > 0) return named;
		const callId = payload.callId;
		return typeof callId === "string" ? (this.toolsByCall.get(callId) ?? "unknown tool") : "unknown tool";
	}

	private personIn(payload: Readonly<Record<string, unknown>>, field: string): string {
		const person = payload[field];
		return typeof person !== "string" || person.length === 0 ? "" : ` by ${person}`;
	}

	private textIn(payload: Readonly<Record<string, unknown>>, field: string): string {
		const value = payload[field];
		return this.shorten(typeof value === "string" ? value : JSON.stringify(value ?? ""));
	}

	private shorten(text: string): string {
		const single = text.replace(/\s+/g, " ").trim();
		return single.length > LIMIT ? `${single.slice(0, LIMIT)}…` : single;
	}
}
