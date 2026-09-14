import "reflect-metadata";
import { Injectable, Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { ToolResultMessage } from "../../domain/model/tool-result-message";
import { Actor } from "../../domain/tool/actor";
import { AdkAccessPolicy } from "../../domain/tool/adk-access-policy";
import { ToolAccess } from "../../domain/tool/tool-access";
import type { ToolContext } from "../../domain/tool/tool-context";
import type { ToolDefinition } from "../../domain/tool/tool-definition";
import { RuntimeOptions } from "../../runtime/composition/runtime-options";
import { ToolCallingModel } from "../../support/nest/tool-calling-model.fixture";
import { AdkRuntimeHost } from "../adk-runtime-host";
import { AdkAgent } from "./adk-agent";
import { AdkModule } from "./adk-module";
import { AdkModuleOptions } from "./adk-module-options";
import { AdkTool } from "./adk-tool";
import { Agent } from "./decorators/agent.decorator";
import { McpController } from "./decorators/mcp-controller.decorator";
import { Tool } from "./decorators/tool.decorator";

const listSchema = z.object({ limit: z.number().int().min(1).default(10) });

@Injectable()
class MeetingsService {
	public listFor(ownerId: string, limit: number): readonly string[] {
		return [`${ownerId}:meeting-1`, `${ownerId}:meeting-2`].slice(0, limit);
	}
}

@Tool({ name: "list_meetings", description: "Lists the caller's meetings.", schema: listSchema, effect: "read" })
class ListMeetingsTool extends AdkTool<typeof listSchema> {
	public constructor(private readonly meetings: MeetingsService) {
		super();
	}

	public execute(input: z.infer<typeof listSchema>, context: ToolContext): unknown {
		return {
			actor: context.actor?.id ?? null,
			meetings: this.meetings.listFor(context.actor?.id ?? "nobody", input.limit),
		};
	}
}

@Agent({ name: "assistant", description: "Answers about meetings.", prompt: "Answer.", tools: [ListMeetingsTool] })
class AssistantAgent extends AdkAgent {
	@Tool({ name: "draft_reply", description: "Only the agent drafts.", schema: z.object({}), effect: "read" })
	public draft(): unknown {
		return { draft: "" };
	}
}

@McpController({ tools: [ListMeetingsTool] })
class MeetingsMcpController {
	public constructor(private readonly meetings: MeetingsService) {}

	@Tool({ name: "count_meetings", description: "Only clients count.", schema: z.object({}), effect: "read" })
	public count(_input: Record<string, never>, context: ToolContext): unknown {
		return { count: this.meetings.listFor(context.actor?.id ?? "nobody", 10).length };
	}
}

class MembersOnly extends AdkAccessPolicy {
	public decide(tool: ToolDefinition, _invocation: unknown, actor: Actor | undefined): ToolAccess {
		if (actor?.claims.member === true) return ToolAccess.granted();
		return ToolAccess.denied(`${tool.name} is for members`);
	}
}

@Module({ providers: [MeetingsService, ListMeetingsTool, AssistantAgent, MeetingsMcpController] })
class MeetingsModule {}

let app: TestingModule | undefined;

async function boot(model: ToolCallingModel): Promise<TestingModule> {
	app = await Test.createTestingModule({
		imports: [
			AdkModule.forRoot(
				AdkModuleOptions.from({ defaultModel: model, runtime: RuntimeOptions.from({ access: new MembersOnly() }) }),
			),
			MeetingsModule,
		],
	}).compile();
	await app.init();
	return app;
}

function toolResultOf(model: ToolCallingModel): ToolResultMessage | undefined {
	return model.requests[1]?.messages.find(
		(message): message is ToolResultMessage => message instanceof ToolResultMessage,
	);
}

afterEach(async () => {
	await app?.close();
	app = undefined;
});

describe("@McpController, booted with the agents", () => {
	it("publishes the shared class and its own methods, and nothing an agent declared for itself", async () => {
		const booted = await boot(new ToolCallingModel("list_meetings", { limit: 1 }));

		const exposed = booted.get(AdkRuntimeHost).runtime.exposed;
		expect(exposed.names).toEqual(["list_meetings", "count_meetings"]);
	});

	it("offers the model the agent's tools alone, so a client-only method never reaches a conversation", async () => {
		const model = new ToolCallingModel("list_meetings", { limit: 1 });
		const booted = await boot(model);

		await booted.get(AssistantAgent).ask("what do I have?", { actor: Actor.of("ana", { member: true }) });

		const offered = model.requests[0]?.tools.map((tool) => tool.name) ?? [];
		expect(offered).toEqual(expect.arrayContaining(["list_meetings", "draft_reply"]));
		expect(offered).not.toContain("count_meetings");
	});

	it("runs a shared tool for the actor who asked, on the instance that has its dependencies", async () => {
		const model = new ToolCallingModel("list_meetings", { limit: 1 });
		const booted = await boot(model);

		await booted.get(AssistantAgent).ask("what do I have?", { actor: Actor.of("ana", { member: true }) });

		expect(toolResultOf(model)?.output).toEqual({ actor: "ana", meetings: ["ana:meeting-1"] });
	});

	it("refuses the same tool to an actor the policy does not admit, and the conversation goes on", async () => {
		const model = new ToolCallingModel("list_meetings", { limit: 1 });
		const booted = await boot(model);

		const result = await booted.get(AssistantAgent).ask("what do I have?", { actor: Actor.of("bob", { member: false }) });

		expect(toolResultOf(model)?.failed).toBe(true);
		expect(toolResultOf(model)?.output).toEqual({ refused: true, reason: "list_meetings is for members" });
		expect(result.text).toBe("done");
	});

	it("refuses a question that named no actor at all, under a policy that wants one", async () => {
		const model = new ToolCallingModel("list_meetings", { limit: 1 });
		const booted = await boot(model);

		await booted.get(AssistantAgent).ask("what do I have?");

		expect(toolResultOf(model)?.failed).toBe(true);
	});
});
