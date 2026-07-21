import "reflect-metadata";
import { Injectable, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AdkAgent } from "../abstracts/adk-agent";
import { AdkEngine } from "../abstracts/adk-engine";
import { Agent } from "../decorators/agent.decorator";
import { ScriptedEngine, text } from "../testing/scripted-engine";
import { AdkModule } from "./adk.module";

// Regression for the load-order bug: the old @InjectAgent relied on a global token map
// snapshotted by forRoot — in multi-module apps the lib module loads BEFORE the feature
// modules and the AgentRef provider was never created. Plain DI has no such coupling:
// the agent instance is the handle, resolved like any provider, in any module order.

// The lib module is evaluated FIRST (mirrors `import AiModule` being the app's first import).
const aiModule = AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "test-model" });

@Agent({ name: "orders_agent", description: "Answers about orders.", prompt: "You answer about orders." })
class OrdersAgent extends AdkAgent {}

@Injectable()
class OrdersUseCase {
	constructor(public readonly agent: OrdersAgent) {}
}

@Module({ providers: [OrdersAgent], exports: [OrdersAgent] })
class AgentsModule {}

@Module({ imports: [AgentsModule], providers: [OrdersUseCase], exports: [OrdersUseCase] })
class OrdersModule {}

@Module({ imports: [aiModule, OrdersModule] })
class RootModule {}

describe("multi-module DI (backend layout)", () => {
	it("injects the agent handle across modules, regardless of load order", async () => {
		const app = await Test.createTestingModule({ imports: [RootModule] }).compile();
		await app.init();

		const useCase = app.get(OrdersUseCase);
		expect(useCase.agent).toBeInstanceOf(OrdersAgent);

		(app.get(AdkEngine) as ScriptedEngine).enqueue([text("order 123 is shipped")]);
		const run = await useCase.agent.ask({ message: "status of order 123?" });
		expect(run.status).toBe("completed");
		expect(run.text).toContain("shipped");

		await app.close();
	});
});
