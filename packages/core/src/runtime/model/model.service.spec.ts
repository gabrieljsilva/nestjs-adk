import { describe, expect, it } from "vitest";
import { ModelResolver } from "../../contracts/model/model-resolver.contract";
import type { AgentDefinition } from "../../domain/agent/agent-definition.value-object";
import { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import { ModelCapabilities } from "../../domain/model/descriptor/model-capabilities.value-object";
import { ModelCapability } from "../../domain/model/descriptor/model-capability.value-object";
import { UnsupportedCapabilityError } from "../../domain/model/errors/unsupported-capability.error";
import type { LlmModel } from "../../domain/model/llm-model.contract";
import { MediaPart } from "../../domain/model/messages/media-part.value-object";
import { AskInput } from "../../domain/session/input/ask-input.command";
import { ScriptedModel } from "../../support/run/scripted-model.fixture";
import { ModelService } from "./model.service";

const PIXEL = "iVBORw0KGgo=";

function modelNamed(id: string, seesImages: boolean): LlmModel {
	return new ScriptedModel(
		id,
		undefined,
		false,
		ModelCapabilities.fromEntries([[ModelCapability.MEDIA_INPUT, seesImages]]),
	);
}

class DeclaredModelResolver extends ModelResolver {
	public constructor(private readonly model: LlmModel) {
		super();
	}

	public resolve(_definition: AgentDefinition): LlmModel {
		return this.model;
	}
}

const ANY_AGENT = undefined as unknown as AgentDefinition;

function serviceOf(model: LlmModel): ModelService {
	return new ModelService(new DeclaredModelResolver(model));
}

function askingWithImage(): AskInput {
	return new AskInput({
		message: "what is this?",
		attachments: [MediaPart.image("image/png", PIXEL)],
	});
}

describe("ModelService", () => {
	it("answers with the model the resolver picked for the agent", () => {
		const declared = modelNamed("declared", false);

		expect(serviceOf(declared).resolve(ANY_AGENT)).toBe(declared);
	});

	it("prefers the model the caller named, because a command names one on purpose", () => {
		const requested = modelNamed("requested", false);

		expect(serviceOf(modelNamed("declared", false)).resolve(ANY_AGENT, requested)).toBe(requested);
	});

	it("refuses an attachment the model never declared it could read", () => {
		expect(() => serviceOf(modelNamed("blind", false)).resolve(ANY_AGENT, undefined, askingWithImage())).toThrow(
			UnsupportedCapabilityError,
		);
	});

	it("lets the attachment through when the model declared media input", () => {
		const seeing = modelNamed("seeing", true);

		expect(serviceOf(seeing).resolve(ANY_AGENT, undefined, askingWithImage())).toBe(seeing);
	});

	it("lets a text artifact through to a model that cannot see, because a tool reads it", () => {
		const blind = modelNamed("blind", false);
		const reading = new AskInput({
			message: "summarize",
			files: [ArtifactContent.fromText("# notes", "text/markdown")],
		});

		expect(serviceOf(blind).resolve(ANY_AGENT, undefined, reading)).toBe(blind);
	});

	it("says nothing about capabilities for a question carrying no attachment", () => {
		const blind = modelNamed("blind", false);

		expect(serviceOf(blind).resolve(ANY_AGENT, undefined, AskInput.fromMessage("hello"))).toBe(blind);
	});

	it("checks the model the caller named, not the one the agent declared", () => {
		const blind = modelNamed("blind", false);

		expect(() => serviceOf(modelNamed("seeing", true)).resolve(ANY_AGENT, blind, askingWithImage())).toThrow(
			UnsupportedCapabilityError,
		);
	});
});
