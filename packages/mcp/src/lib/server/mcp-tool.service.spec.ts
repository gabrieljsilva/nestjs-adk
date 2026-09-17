import {
	Actor,
	AdkAccessPolicy,
	ToolAccess,
	ToolCatalog,
	type ToolContext,
	ToolDefinition,
	ToolEffect,
	ToolGate,
	ToolHandler,
	ToolOutput,
	ZodToolSchema,
} from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { McpCall } from "./mcp-call.value-object";
import { McpExposure } from "./mcp-exposure.contract";
import { McpToolService } from "./mcp-tool.service";

class RecordingHandler extends ToolHandler {
	public contexts: ToolContext[] = [];

	public constructor(private readonly answer: (args: Record<string, unknown>) => unknown) {
		super();
	}

	public async invoke(args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
		this.contexts.push(context);
		return this.answer(args);
	}
}

class MembersOnly extends AdkAccessPolicy {
	public decide(tool: ToolDefinition, _invocation: unknown, actor: Actor | undefined): ToolAccess {
		return actor?.claims.member === true ? ToolAccess.granted() : ToolAccess.denied(`${tool.name} is for members`);
	}
}

class FixedExposure extends McpExposure {
	public constructor(
		public readonly catalog: ToolCatalog,
		public readonly gate: ToolGate,
	) {
		super();
	}
}

const listSchema = z.object({ limit: z.number().int().min(1).describe("How many.") });

function listMeetings(handler: ToolHandler, effect = ToolEffect.READ): ToolDefinition {
	return new ToolDefinition("list_meetings", "Lists meetings.", ZodToolSchema.fromSchema(listSchema), effect, handler);
}

function serviceOf(...tools: ToolDefinition[]): McpToolService {
	return new McpToolService(new FixedExposure(new ToolCatalog(tools), new ToolGate(new MembersOnly())));
}

const MEMBER = Actor.fromId("ana", { member: true });
const STRANGER = Actor.fromId("bob", { member: false });

describe("McpToolService", () => {
	it("lists every published tool with its schema and its effect as hints", () => {
		const listed = serviceOf(listMeetings(new RecordingHandler(() => []), ToolEffect.DESTRUCTIVE)).list();

		expect(listed).toHaveLength(1);
		expect(listed[0]?.name).toBe("list_meetings");
		expect(listed[0]?.description).toBe("Lists meetings.");
		expect(listed[0]?.inputSchema).toMatchObject({ type: "object", properties: { limit: { type: "integer" } } });
		expect(listed[0]?.annotations).toEqual({ readOnlyHint: false, destructiveHint: true });
	});

	it("runs a tool for the actor the request resolved to, with the parsed arguments", async () => {
		const handler = new RecordingHandler((args) => ({ got: args.limit }));

		const result = await serviceOf(listMeetings(handler)).call(
			"list_meetings",
			{ limit: 2, junk: 1 },
			MEMBER,
			McpCall.fromRequest(1),
		);

		expect(result.isError).toBeUndefined();
		expect(result.structuredContent).toEqual({ got: 2 });
		expect(result.content).toEqual([{ type: "text", text: '{"got":2}' }]);
		expect(handler.contexts[0]?.actor).toBe(MEMBER);
		expect(handler.contexts[0]?.runId.value).toBe("mcp:1");
	});

	it("refuses an actor the policy does not admit, with the policy's reason, and never runs the tool", async () => {
		const handler = new RecordingHandler(() => []);

		const result = await serviceOf(listMeetings(handler)).call(
			"list_meetings",
			{ limit: 2 },
			STRANGER,
			McpCall.fromRequest(1),
		);

		expect(result.isError).toBe(true);
		expect(result.content).toEqual([{ type: "text", text: "list_meetings is for members" }]);
		expect(handler.contexts).toHaveLength(0);
	});

	it("refuses arguments the schema rejects before touching the tool", async () => {
		const handler = new RecordingHandler(() => []);

		const result = await serviceOf(listMeetings(handler)).call(
			"list_meetings",
			{ limit: 0 },
			MEMBER,
			McpCall.fromRequest(1),
		);

		expect(result.isError).toBe(true);
		expect(handler.contexts).toHaveLength(0);
	});

	it("refuses a tool nobody published", async () => {
		const result = await serviceOf().call("drop_everything", {}, MEMBER, McpCall.fromRequest(1));

		expect(result.isError).toBe(true);
		expect(result.content[0]).toMatchObject({ text: "Unknown tool: drop_everything." });
	});

	it("answers a thrown error as an error result rather than a protocol failure", async () => {
		const handler = new RecordingHandler(() => {
			throw new Error("the database is away");
		});

		const result = await serviceOf(listMeetings(handler)).call(
			"list_meetings",
			{ limit: 1 },
			MEMBER,
			McpCall.fromRequest(1),
		);

		expect(result.isError).toBe(true);
		expect(result.content[0]).toMatchObject({ text: "the database is away" });
	});

	it("passes text through and unwraps a ToolOutput", async () => {
		const asText = await serviceOf(listMeetings(new RecordingHandler(() => "two meetings"))).call(
			"list_meetings",
			{ limit: 1 },
			MEMBER,
			McpCall.fromRequest(1),
		);
		const wrapped = await serviceOf(listMeetings(new RecordingHandler(() => new ToolOutput({ n: 2 })))).call(
			"list_meetings",
			{ limit: 1 },
			MEMBER,
			McpCall.fromRequest(1),
		);

		expect(asText.content).toEqual([{ type: "text", text: "two meetings" }]);
		expect(asText.structuredContent).toBeUndefined();
		expect(wrapped.structuredContent).toEqual({ n: 2 });
	});

	it("treats absent arguments as none, which a tool with no parameters accepts", async () => {
		const ping = new ToolDefinition(
			"ping",
			"Pings.",
			ZodToolSchema.fromSchema(z.object({})),
			ToolEffect.READ,
			new RecordingHandler(() => "pong"),
		);

		const result = await serviceOf(ping).call("ping", undefined, MEMBER, McpCall.fromRequest(1));

		expect(result.isError).toBeUndefined();
	});
});
