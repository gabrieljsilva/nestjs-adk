import { AgentDefinition, AgentDescription, AgentName, type LlmModel, ModelResolver } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { RoutingModelResolver } from "./routing-model-resolver";
import { ScriptedModel } from "./scripted-model";

const DECLARED = new ScriptedModel("declared");

function definitionOf(name: string, model: LlmModel = DECLARED): AgentDefinition {
	return AgentDefinition.of(AgentName.from(name), AgentDescription.from("An agent.", name), model);
}

class AlwaysResolver extends ModelResolver {
	public constructor(private readonly answer: LlmModel) {
		super();
	}

	public resolve(_definition: AgentDefinition): LlmModel {
		return this.answer;
	}
}

/** The names it was told about, which is what a boot check reads. */
function routedNames(resolver: RoutingModelResolver): readonly string[] {
	return resolver.routed;
}

describe("RoutingModelResolver", () => {
	it("answers the model one agent was routed to", () => {
		const routed = new ScriptedModel("routed");
		const resolver = new RoutingModelResolver().route("billing", routed);

		expect(resolver.resolve(definitionOf("billing"))).toBe(routed);
	});

	it("leaves an agent nobody routed on the model its definition carries", () => {
		const resolver = new RoutingModelResolver().route("billing", new ScriptedModel("routed"));

		expect(resolver.resolve(definitionOf("warranty"))).toBe(DECLARED);
	});

	it("asks the resolver it was given for an agent nobody routed", () => {
		const fallbackModel = new ScriptedModel("from the fallback");
		const resolver = new RoutingModelResolver(new AlwaysResolver(fallbackModel)).route("billing", DECLARED);

		expect(resolver.resolve(definitionOf("warranty"))).toBe(fallbackModel);
	});

	it("says which agents it was told about", () => {
		const resolver = new RoutingModelResolver().route("billing", DECLARED).route("warranty", DECLARED);

		expect(resolver.has("billing")).toBe(true);
		expect(resolver.has("sales")).toBe(false);
		expect(routedNames(resolver)).toEqual(["billing", "warranty"]);
	});

	it("takes the last routing for the same agent", () => {
		const second = new ScriptedModel("second");
		const resolver = new RoutingModelResolver().route("billing", new ScriptedModel("first")).route("billing", second);

		expect(resolver.resolve(definitionOf("billing"))).toBe(second);
	});
});
