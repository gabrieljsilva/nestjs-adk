import { Injectable, Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { z } from "zod";
import { AdkAgent } from "../abstracts/adk-agent";
import { AdkEngine } from "../abstracts/adk-engine";
import { AdkTool } from "../abstracts/adk-tool";
import { Agent } from "../decorators/agent.decorator";
import { Tool } from "../decorators/tool.decorator";
import { ToolInvalidArgsError } from "../errors";
import { AdkModule } from "../module/adk.module";
import { ScriptedEngine, callTool, text } from "../testing/scripted-engine";

@Injectable()
class Spy {
	public received: unknown[] = [];
}

const listSchema = z.object({
	/** The model chooses this one. */
	query: z.string(),
	limit: z.number().default(10),
});

@Tool({ name: "list_items", description: "Lists items.", schema: listSchema })
class ListItemsTool extends AdkTool<typeof listSchema> {
	constructor(private readonly spy: Spy) {
		super();
	}

	execute(input: z.infer<typeof listSchema>) {
		this.spy.received.push(input);
		return { ok: true };
	}
}

@Tool({ name: "count_items", description: "Counts items.", schema: listSchema })
class CountItemsTool extends AdkTool<typeof listSchema> {
	execute(input: z.infer<typeof listSchema>) {
		return { count: input.query.length };
	}
}

@Agent({ name: "lister", description: "Lists things.", prompt: "List.", tools: [ListItemsTool, CountItemsTool] })
class ListerAgent extends AdkAgent {}

@Injectable()
class ChatService {
	constructor(
		public readonly agent: ListerAgent,
		public readonly spy: Spy,
	) {}
}

@Module({ providers: [Spy, ListItemsTool, CountItemsTool, ListerAgent, ChatService] })
class FeatureModule {}

describe("tool input validation", () => {
	let app: TestingModule;
	let chat: ChatService;
	let engine: InstanceType<typeof ScriptedEngine>;

	async function boot(maxInvalidArgs?: number) {
		app = await Test.createTestingModule({
			imports: [
				AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "test-model", defaults: { maxInvalidArgs } }),
				FeatureModule,
			],
		}).compile();
		await app.init();
		chat = app.get(ChatService);
		engine = app.get(AdkEngine) as InstanceType<typeof ScriptedEngine>;
	}

	afterEach(async () => {
		await app?.close();
	});

	it("strips keys the model invented: the schema is the whole contract", async () => {
		await boot();
		engine.enqueue([
			callTool("list_items", { query: "invoices", limit: 5, workspaceId: "someone-elses-workspace" }),
			text("done"),
		]);

		await chat.agent.ask({ message: "list invoices" });

		// a forged scope key must never reach the tool: a spread of `input` into a query would be an IDOR
		expect(chat.spy.received).toEqual([{ query: "invoices", limit: 5 }]);
	});

	it("applies schema defaults, so z.infer stops being a fiction", async () => {
		await boot();
		engine.enqueue([callTool("list_items", { query: "invoices" }), text("done")]);

		await chat.agent.ask({ message: "list invoices" });

		expect(chat.spy.received).toEqual([{ query: "invoices", limit: 10 }]);
	});

	it("hands invalid arguments back to the model instead of killing the run", async () => {
		await boot();
		engine.enqueue([callTool("list_items", { query: 42 }), text("recovered")]);

		const run = await chat.agent.ask({ message: "list invoices" });

		// the model wrote the argument and is the only one who can fix it: one bad guess is not fatal
		expect(chat.spy.received).toEqual([]);
		expect(run.text).toBe("recovered");
		const result = run.events.find((event) => event.type === "tool_result");
		expect(JSON.stringify(result)).toMatch(/query/);
	});

	it("aborts once the model has burned its retries on the same tool", async () => {
		await boot();
		engine.enqueue([
			callTool("list_items", { query: 1 }),
			callTool("list_items", { query: 2 }),
			callTool("list_items", { query: 3 }),
			text("never reached"),
		]);

		// two corrections is generosity; a third identical mistake is a broken contract, not a typo
		await expect(chat.agent.ask({ message: "list invoices" })).rejects.toBeInstanceOf(ToolInvalidArgsError);
	});

	it("maxInvalidArgs: 0 kills the run on the first bad argument", async () => {
		await boot(0);
		engine.enqueue([callTool("list_items", { query: 1 }), text("never reached")]);

		await expect(chat.agent.ask({ message: "list invoices" })).rejects.toBeInstanceOf(ToolInvalidArgsError);
	});

	it("counts each tool separately, so one stuck schema does not condemn another", async () => {
		await boot(1);
		engine.enqueue([callTool("list_items", { query: 1 }), callTool("count_items", { query: 2 }), text("done")]);

		// a global counter would abort here: two tools, one bad call each, neither past its own limit
		const run = await chat.agent.ask({ message: "list invoices" });

		expect(run.text).toBe("done");
	});

	it("counts per tool and forgives a valid call in between", async () => {
		await boot();
		engine.enqueue([
			callTool("list_items", { query: 1 }),
			callTool("list_items", { query: "invoices" }),
			callTool("list_items", { query: 2 }),
			callTool("list_items", { query: 3 }),
			text("done"),
		]);

		// a run that recovers has not burned anything: the counter tracks a stuck model, not a total
		const run = await chat.agent.ask({ message: "list invoices" });

		expect(run.text).toBe("done");
		expect(chat.spy.received).toEqual([{ query: "invoices", limit: 10 }]);
	});
});
