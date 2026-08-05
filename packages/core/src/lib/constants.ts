// One definition, shared: the decorators write these and the native scanner reads them.
export {
	AGENT_METADATA,
	DELEGATES_TO_METADATA,
	INLINE_SKILLS_METADATA,
	INLINE_TOOLS_METADATA,
	SKILL_METADATA,
	TOOL_METADATA,
	TRANSFERS_TO_METADATA,
} from "../adapters/nest/metadata-keys";

export const EMBEDDER_METADATA = Symbol("adk:embedder");
export const WORKFLOW_METADATA = Symbol("adk:workflow");

export const ADK_OPTIONS = Symbol("adk:options");
export const ADK_RUNNER = Symbol("adk:runner");
