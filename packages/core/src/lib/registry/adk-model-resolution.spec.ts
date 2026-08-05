import "reflect-metadata";
import { Injectable, Module, Scope, type Type } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AdkAgent } from "../abstracts/adk-agent";
import { AdkEngine } from "../abstracts/adk-engine";
import { AdkModel, isAdkModel } from "../abstracts/adk-model";
import { Agent } from "../decorators/agent.decorator";
import { InvalidModelError, UnregisteredModelError, UnsupportedModelScopeError } from "../errors";
import { Gemini } from "../models/model-specs";
import { AdkModule, type AdkModuleOptions } from "../module/adk.module";
import type { ModelRequest, ModelResponse } from "../types/model-io";
import { AgentRegistry } from "./agent-registry";

@Injectable()
class FakeEngine extends AdkEngine {
	public async *run(): AsyncGenerator<never> {}
}

@Injectable()
class GreetingService {
	public readonly prefix = "olá";
}

@Injectable()
class EchoModel extends AdkModel {
	public readonly model = "echo-1";

	public constructor(private readonly greeting: GreetingService) {
		super();
	}

	public async *generate(request: ModelRequest): AsyncIterable<ModelResponse> {
		const last = request.messages.at(-1)?.parts.find((part) => "text" in part);
		yield { parts: [{ text: `${this.greeting.prefix}:${last && "text" in last ? last.text : ""}` }] };
	}
}

async function bootstrapWith(providers: Type[], options: Partial<AdkModuleOptions> = {}) {
	@Module({ providers })
	class FeatureModule {}

	const moduleRef = await Test.createTestingModule({
		imports: [AdkModule.forRoot({ engine: FakeEngine, defaultModel: "gemini-2.5-flash", ...options }), FeatureModule],
	}).compile();
	await moduleRef.init();
	return moduleRef;
}

describe("AgentRegistry: AdkModel resolution at boot", () => {
	it("model as class → resolved to the DI instance (dependencies injected)", async () => {
		@Agent({ name: "custom_agent", description: "d", model: EchoModel })
		class CustomAgent extends AdkAgent {}

		const app = await bootstrapWith([CustomAgent, EchoModel, GreetingService]);
		const definition = app.get(AgentRegistry).getByType(CustomAgent);

		expect(definition.model).toBe(app.get(EchoModel));
		expect(isAdkModel(definition.model)).toBe(true);
		await app.close();
	});

	it("failover targets as classes → resolved copy at boot, original spec untouched", async () => {
		const spec = new Gemini("gemini-2.5-flash", { failover: [EchoModel] });

		@Agent({ name: "routed_custom_agent", description: "d", model: spec })
		class RoutedAgent extends AdkAgent {}

		const app = await bootstrapWith([RoutedAgent, EchoModel, GreetingService]);
		const resolved = app.get(AgentRegistry).getByType(RoutedAgent).model as Gemini;

		expect(resolved).not.toBe(spec);
		expect(resolved.model).toBe("gemini-2.5-flash");
		expect((resolved.failover as unknown[])[0]).toBe(app.get(EchoModel));
		expect((spec.failover as unknown[])[0]).toBe(EchoModel);
		await app.close();
	});

	it("forRoot defaultModel as AdkModel class → resolved for agents without a model", async () => {
		@Agent({ name: "defaults_agent", description: "d" })
		class DefaultsAgent extends AdkAgent {}

		const app = await bootstrapWith([DefaultsAgent, EchoModel, GreetingService], { defaultModel: EchoModel });
		expect(app.get(AgentRegistry).getByType(DefaultsAgent).model).toBe(app.get(EchoModel));
		await app.close();
	});

	it("AdkModel instance in @Agent passes through untouched (no DI lookup)", async () => {
		const instance = new EchoModel(new GreetingService());

		@Agent({ name: "instance_agent", description: "d", model: instance })
		class InstanceAgent extends AdkAgent {}

		const app = await bootstrapWith([InstanceAgent]);
		expect(app.get(AgentRegistry).getByType(InstanceAgent).model).toBe(instance);
		await app.close();
	});

	it("model class not registered as provider → UnregisteredModelError", async () => {
		@Agent({ name: "ghost_agent", description: "d", model: EchoModel })
		class GhostAgent extends AdkAgent {}

		await expect(bootstrapWith([GhostAgent])).rejects.toBeInstanceOf(UnregisteredModelError);
	});

	it("REQUEST-scoped model provider → UnsupportedModelScopeError (not the misleading 'unregistered')", async () => {
		@Injectable({ scope: Scope.REQUEST })
		class ScopedModel extends AdkModel {
			public readonly model = "scoped";
			public async *generate(): AsyncIterable<ModelResponse> {}
		}

		@Agent({ name: "scoped_agent", description: "d", model: ScopedModel })
		class ScopedAgent extends AdkAgent {}

		await expect(bootstrapWith([ScopedAgent, ScopedModel])).rejects.toBeInstanceOf(UnsupportedModelScopeError);
	});

	it("model class that does not extend AdkModel → InvalidModelError", async () => {
		@Injectable()
		class NotAModel {}

		@Agent({ name: "invalid_agent", description: "d", model: NotAModel })
		class InvalidAgent extends AdkAgent {}

		await expect(bootstrapWith([InvalidAgent, NotAModel])).rejects.toBeInstanceOf(InvalidModelError);
	});

	it("isAdkModel: discriminates instances, not classes or plain objects", () => {
		expect(isAdkModel({})).toBe(false);
		expect(isAdkModel(EchoModel)).toBe(false);
		expect(isAdkModel(new EchoModel(new GreetingService()))).toBe(true);
	});
});
