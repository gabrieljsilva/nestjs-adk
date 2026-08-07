import { AgentMetadata, AgentRegistry } from "@nestjs-adk/core";
import type { TestingModule } from "@nestjs/testing";
import type { RunEvents } from "./run-events";
import type { RunRecorder } from "./run-recorder";
import type { ScriptedModel } from "./scripted-model";
import { TestAgent } from "./test-agent";
import type { ToolFake } from "./tool-fake";

/** Anything a token can be asked of: a class, a string or a symbol. */
type Token<T> = (abstract new (...args: never[]) => T) | string | symbol;

/**
 * A booted application, with the pieces the test replaced already in place.
 *
 * The application itself is untouched: this is the real module, composed the way NestJS
 * composes it, with the model of each agent decided by the test and a recorder watching.
 * Everything reachable from the container stays reachable, so a use case is asked for by
 * type and answers through the same runtime a request would have used.
 */
export class AdkTestBed {
	public constructor(
		public readonly module: TestingModule,
		private readonly recorder: RunRecorder,
		private readonly scripts: ReadonlyMap<string, ScriptedModel>,
		private readonly fakes: ReadonlyMap<unknown, ToolFake>,
	) {}

	/** Everything every run published, for an assertion about a run the test did not start. */
	public get events(): RunEvents {
		return this.recorder.events;
	}

	public get<T>(token: Token<T>): T {
		return this.module.get(token);
	}

	/**
	 * A handle on one agent, holding the session between questions.
	 *
	 * Takes the class an application injects or the name `@Agent` declared. Two calls for
	 * the same agent answer the same handle, so a follow up continues the conversation
	 * rather than opening a new one.
	 */
	public agent(agent: unknown): TestAgent {
		const name = AdkTestBed.nameOf(agent);
		const existing = this.agents.get(name);
		if (existing !== undefined) return existing;
		const handle = new TestAgent(this.module.get(AgentRegistry).get(name), this.recorder, this.scripts.get(name));
		this.agents.set(name, handle);
		return handle;
	}

	/** The script behind one agent, for a test that queues turns as the conversation goes. */
	public script(agent: unknown): ScriptedModel | undefined {
		return this.scripts.get(AdkTestBed.nameOf(agent));
	}

	/** The double that replaced a tool class, with what it was called with. */
	public tool(type: unknown): ToolFake | undefined {
		return this.fakes.get(type);
	}

	/**
	 * Fails when a script still holds turns nobody played.
	 *
	 * A conversation the test described and the run never had is a finding: the run either
	 * stopped early or took a path the script does not cover.
	 */
	public verify(): void {
		for (const script of this.scripts.values()) script.verify();
	}

	public async close(): Promise<void> {
		await this.module.close();
	}

	/** Lets a test own the bed lexically with `await using`, including cleanup after failures. */
	public async [Symbol.asyncDispose](): Promise<void> {
		await this.close();
	}

	private readonly agents = new Map<string, TestAgent>();

	/** A class carries its declared name in metadata; a string is already the name. */
	private static nameOf(agent: unknown): string {
		return typeof agent === "string" ? agent : AgentMetadata.findOrFail(agent).name;
	}
}
