import { type PublishedEvent, SessionEventConsumer } from "@nestjs-adk/core";

const TOOL_REQUESTED = "tool.call-requested";
const TOOL_PRODUCED = "tool.result-produced";
const ASSISTANT_MESSAGE = "run.assistant-message-produced";

/**
 * What the sessions did, as a test can assert on it.
 *
 * A consumer is the only way to see which tools actually ran when the model is a real
 * one: nothing else survives the run, and reading the answer's prose would be asserting
 * that the model described what it did rather than that it did it.
 *
 * It records and never decides, which is what a consumer is: it runs after the commit
 * and a failure here changes nothing about the run.
 */
export class RecordedEvents extends SessionEventConsumer {
	public readonly name = "recorded-events";

	private readonly received: PublishedEvent[] = [];

	public async consume(event: PublishedEvent): Promise<void> {
		this.received.push(event);
	}

	public get types(): readonly string[] {
		return this.received.map((event) => event.type);
	}

	public countOf(type: string): number {
		return this.received.filter((event) => event.type === type).length;
	}

	/** The tools that answered, which is what happened, not what the model asked for. */
	public get toolsRun(): readonly string[] {
		return this.namesOf(TOOL_PRODUCED);
	}

	public get toolsRequested(): readonly string[] {
		return this.namesOf(TOOL_REQUESTED);
	}

	public ran(tool: string): number {
		return this.toolsRun.filter((name) => name === tool).length;
	}

	/**
	 * The most tool calls one turn asked for at once.
	 *
	 * A turn is a model answer followed by the calls it requested, so the longest run of
	 * requests with no answer between them is how many the model asked for together.
	 */
	public get largestBatch(): number {
		let largest = 0;
		let current = 0;
		for (const event of this.received) {
			if (event.type === TOOL_REQUESTED) current += 1;
			if (event.type === ASSISTANT_MESSAGE) current = 0;
			largest = Math.max(largest, current);
		}
		return largest;
	}

	public clear(): void {
		this.received.length = 0;
	}

	private namesOf(type: string): readonly string[] {
		const names: string[] = [];
		for (const event of this.received) {
			if (event.type !== type) continue;
			const name = event.payload.toolName;
			if (typeof name === "string") names.push(name);
		}
		return names;
	}
}
