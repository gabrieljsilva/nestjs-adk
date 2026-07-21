import { AdkAgent, AdkModule, AdkTool, Agent, ScriptedModel, Tool } from "@nestjs-adk/core";
import { Module } from "@nestjs/common";
import { z } from "zod";
import { createAdkEntry } from "./create-adk-entry";
import { GoogleAdkEngine } from "./google-adk-engine";

const echoSchema = z.object({ value: z.string() });

@Tool({ name: "echo", description: "Echoes the value.", schema: echoSchema })
class EchoTool extends AdkTool<typeof echoSchema> {
	execute(input: z.infer<typeof echoSchema>) {
		return { echoed: input.value };
	}
}

@Agent({
	name: "echo_assistant",
	description: "Echoes things.",
	prompt: "You echo.",
	tools: [EchoTool],
})
class EchoAgent extends AdkAgent {}

@Module({
	imports: [AdkModule.forRoot({ engine: GoogleAdkEngine, defaultModel: new ScriptedModel() })],
	providers: [EchoTool, EchoAgent],
})
class AppModule {}

describe("createAdkEntry — native LlmAgent for `adk web`/devtools", () => {
	it("bootstraps the Nest context and returns the agent resolved via DI", async () => {
		const rootAgent = await createAdkEntry(AppModule, EchoAgent);

		expect(rootAgent.name).toBe("echo_assistant");
		expect(rootAgent.instruction).toContain("You echo.");
		expect(rootAgent.tools.map((tool) => (tool as { name?: string }).name)).toContain("echo");
	});
});
