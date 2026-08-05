import { describe, expect, it } from "vitest";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { SessionId } from "../../common/identity/session-id";
import { ToolSource } from "../../contracts/tool-source";
import { ToolSourceAuthError } from "../../domain/tool/errors/tool-source-auth.error";
import { ParsedArguments } from "../../domain/tool/parsed-arguments";
import { ToolDefinition } from "../../domain/tool/tool-definition";
import { ToolEffect } from "../../domain/tool/tool-effect";
import { ToolHandler } from "../../domain/tool/tool-handler";
import { ToolSchema } from "../../domain/tool/tool-schema";
import { ToolSourceScope } from "./tool-source-scope";

const SESSION = SessionId.from("s-1");
const RUN = AgentRunId.from("run-1");

class AnySchema extends ToolSchema {
	public declaration(): unknown {
		return {};
	}

	public parse(): ParsedArguments {
		return ParsedArguments.valid({});
	}
}

class NoopHandler extends ToolHandler {
	public async invoke(): Promise<unknown> {
		return undefined;
	}
}

class OpeningSource extends ToolSource {
	public opens = 0;
	public closes = 0;

	public constructor(public readonly name: string) {
		super();
	}

	public async open(): Promise<readonly ToolDefinition[]> {
		this.opens += 1;
		return [
			new ToolDefinition(`${this.name}_tool`, "a remote tool", new AnySchema(), ToolEffect.READ, new NoopHandler()),
		];
	}

	public async close(): Promise<void> {
		this.closes += 1;
	}
}

class RefusingSource extends ToolSource {
	public readonly name = "refusing";
	public closes = 0;

	public async open(): Promise<readonly ToolDefinition[]> {
		throw new ToolSourceAuthError(this.name, "the token expired");
	}

	public async close(): Promise<void> {
		this.closes += 1;
	}
}

describe("ToolSourceScope", () => {
	it("offers everything the sources opened, in the order they were declared", async () => {
		const scope = new ToolSourceScope([new OpeningSource("mcp"), new OpeningSource("catalog")]);

		const tools = await scope.open(SESSION, RUN);

		expect(tools.map((tool) => tool.name)).toEqual(["mcp_tool", "catalog_tool"]);
	});

	it("opens each source once per run", async () => {
		const source = new OpeningSource("mcp");
		const scope = new ToolSourceScope([source]);

		await scope.open(SESSION, RUN);

		expect(source.opens).toBe(1);
	});

	it("closes what it opened", async () => {
		const source = new OpeningSource("mcp");
		const scope = new ToolSourceScope([source]);
		await scope.open(SESSION, RUN);

		await scope.close(RUN);

		expect(source.closes).toBe(1);
	});

	it("closes only once, however many times close is called", async () => {
		const source = new OpeningSource("mcp");
		const scope = new ToolSourceScope([source]);
		await scope.open(SESSION, RUN);

		await scope.close(RUN);
		await scope.close(RUN);

		expect(source.closes).toBe(1);
	});

	it("carries on with the tools that did open when one will not authorize", async () => {
		const scope = new ToolSourceScope([new RefusingSource(), new OpeningSource("mcp")]);

		const tools = await scope.open(SESSION, RUN);

		expect(tools.map((tool) => tool.name)).toEqual(["mcp_tool"]);
		expect(scope.unauthorized).toHaveLength(1);
		expect(scope.unauthorized[0]?.source).toBe("refusing");
	});

	it("never closes a source that never opened", async () => {
		const refusing = new RefusingSource();
		const scope = new ToolSourceScope([refusing]);
		await scope.open(SESSION, RUN);

		await scope.close(RUN);

		expect(refusing.closes).toBe(0);
	});

	it("lets a failure that is not about credentials stop the run", async () => {
		class BrokenSource extends ToolSource {
			public readonly name = "broken";

			public async open(): Promise<readonly ToolDefinition[]> {
				throw new TypeError("the adapter has a bug");
			}

			public async close(): Promise<void> {
				return undefined;
			}
		}

		await expect(new ToolSourceScope([new BrokenSource()]).open(SESSION, RUN)).rejects.toBeInstanceOf(TypeError);
	});

	it("closes the rest even when one source refuses to close", async () => {
		class StuckSource extends OpeningSource {
			public async close(): Promise<void> {
				throw new Error("the socket is gone");
			}
		}
		const healthy = new OpeningSource("mcp");
		const scope = new ToolSourceScope([new StuckSource("stuck"), healthy]);
		await scope.open(SESSION, RUN);

		await expect(scope.close(RUN)).resolves.toBeUndefined();
		expect(healthy.closes).toBe(1);
	});
});
