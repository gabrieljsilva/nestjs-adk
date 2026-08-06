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

	public constructor(private readonly print: (line: string) => void = console.log) {
		super();
	}

	public async consume(event: PublishedEvent): Promise<void> {
		const line = this.lineOf(event);
		if (line !== undefined) this.print(line);
	}

	private lineOf(event: PublishedEvent): string | undefined {
		const payload = event.payload;
		if (event.type === "session.user-message-received") return `  › ${this.textIn(payload, "text")}`;
		if (event.type === "run.assistant-message-produced") return `  ‹ ${this.textIn(payload, "text")}`;
		if (event.type === "tool.call-requested") {
			return `  ⚙ ${this.textIn(payload, "toolName")}(${this.shorten(JSON.stringify(payload.args ?? {}))})`;
		}
		if (event.type === "tool.result-produced") {
			return `  ↩ ${this.textIn(payload, "toolName")} ${this.shorten(JSON.stringify(payload.output ?? {}))}`;
		}
		if (event.type === "tool.approval-requested") return `  ⏸ waiting for a human: ${this.textIn(payload, "toolName")}`;
		if (event.type === "agent.transferred") return `  → ${this.textIn(payload, "to")}`;
		if (event.type === "delegation.started") return `  ⤳ ${this.textIn(payload, "toAgent")}`;
		return undefined;
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
