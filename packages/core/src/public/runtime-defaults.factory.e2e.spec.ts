import "reflect-metadata";
import {
	AdkAgent,
	AdkModule,
	Agent,
	AgentDefinition,
	AgentDescription,
	AgentName,
	ArtifactStorage,
	Clock,
	IdGenerator,
	LlmModel,
	ModelCapabilities,
	ModelChunk,
	ModelContextWindow,
	ModelDescriptor,
	ModelIdentity,
	ModelUsage,
	SessionStorage,
	createAdkRuntime,
} from "@nestjs-adk/core";
import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

/** Enough of a model to compose a runtime around; nothing here asks it anything. */
class SilentModel extends LlmModel {
	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			new ModelIdentity("acme", "primary"),
			new ModelContextWindow(100_000, 4000),
			ModelCapabilities.none(),
		);
	}

	public async *generate(): AsyncIterable<ModelChunk> {
		yield ModelChunk.text("ok");
		yield ModelChunk.usage(ModelUsage.fromReport(1, 1));
		yield ModelChunk.finish("stop");
	}
}

@Agent({ name: "support", description: "answers about orders" })
@Injectable()
class SupportAgent extends AdkAgent {}

/**
 * The two entry points, asked what they composed themselves with.
 *
 * It is the classes that are compared and not the instances: two runtimes never share a
 * storage, and the question is whether the same code stores conversations in one place
 * under NestJS and in another without it. One table answers both, and this is what says so.
 */
describe("the defaults both entry points compose with", () => {
	it("picks the same storage, artifacts, clock and ids with or without a container", async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ defaultModel: new SilentModel() })],
			providers: [SupportAgent],
		}).compile();
		const app = await moduleRef.init();

		const adk = await createAdkRuntime({
			agents: [
				new AgentDefinition({
					name: AgentName.from("support"),
					description: AgentDescription.from("answers about orders", "support"),
					model: new SilentModel(),
				}),
			],
		});
		const composed = adk.composed;
		await adk.stop();
		await app.close();

		expect(composed.storage.constructor).toBe(app.get(SessionStorage).constructor);
		expect(composed.artifacts.constructor).toBe(app.get(ArtifactStorage).constructor);
		expect(composed.clock.constructor).toBe(app.get(Clock).constructor);
		expect(composed.ids.constructor).toBe(app.get(IdGenerator).constructor);
	});
});
