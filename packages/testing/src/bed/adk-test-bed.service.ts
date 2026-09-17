import { AgentMetadata, AgentRegistry } from "@nestjs-adk/core";
import type { TestingModule } from "@nestjs/testing";
import type { ScriptedModel } from "../model/scripted-model.double";
import type { RunEvents } from "../recording/run-events.value-object";
import type { RunRecorder } from "../recording/run-recorder.service";
import type { ToolFake } from "../tool-fake.double";
import { TestAgent } from "./test-agent.double";

type Token<T> = (abstract new (...args: never[]) => T) | string | symbol;

/**
 * A booted application, as a test reaches into it: `get` for any provider, `agent` for one agent
 * to drive, `script` and `tool` for the doubles, and `events` for everything that happened in
 * the last run, whoever started it.
 *
 * `verify` fails when the test described a conversation the run never had. The bed owns the
 * Nest application, so close it, or use `await using` and let disposal do it.
 */
export class AdkTestBed {
	public constructor(
		public readonly module: TestingModule,
		private readonly recorder: RunRecorder,
		private readonly scripts: ReadonlyMap<string, ScriptedModel>,
		private readonly fakes: ReadonlyMap<unknown, ToolFake>,
	) {}

	public get events(): RunEvents {
		return this.recorder.events;
	}

	public get<T>(token: Token<T>): T {
		return this.module.get(token);
	}

	public agent(agent: unknown): TestAgent {
		const name = AdkTestBed.readName(agent);
		const existing = this.agents.get(name);
		if (existing !== undefined) return existing;
		const handle = new TestAgent(this.module.get(AgentRegistry).open(name), this.recorder, this.scripts.get(name));
		this.agents.set(name, handle);
		return handle;
	}

	public script(agent: unknown): ScriptedModel | undefined {
		return this.scripts.get(AdkTestBed.readName(agent));
	}

	public tool(type: unknown): ToolFake | undefined {
		return this.fakes.get(type);
	}

	public verify(): void {
		for (const script of this.scripts.values()) script.verify();
	}

	public async close(): Promise<void> {
		await this.module.close();
	}

	public async [Symbol.asyncDispose](): Promise<void> {
		await this.close();
	}

	private readonly agents = new Map<string, TestAgent>();

	private static readName(agent: unknown): string {
		return typeof agent === "string" ? agent : AgentMetadata.findOrFail(agent).name;
	}
}
