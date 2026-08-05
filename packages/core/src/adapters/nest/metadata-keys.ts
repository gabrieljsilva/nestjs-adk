/**
 * The reflect keys the decorators write and the scanner reads.
 *
 * Symbols rather than strings: two libraries that both decided to call their key
 * `"adk:agent"` would silently overwrite each other, and a symbol cannot collide with
 * anything it was not handed to.
 *
 * They live on the adapter side because that is the only side that touches reflect
 * metadata at all. Nothing in the domain or the runtime knows a decorator exists.
 */
export const AGENT_METADATA = Symbol.for("adk:agent");
export const TOOL_METADATA = Symbol.for("adk:tool");
export const SKILL_METADATA = Symbol.for("adk:skill");
export const INLINE_TOOLS_METADATA = Symbol.for("adk:inline-tools");
export const INLINE_SKILLS_METADATA = Symbol.for("adk:inline-skills");
export const TRANSFERS_TO_METADATA = Symbol.for("adk:transfers-to");
export const DELEGATES_TO_METADATA = Symbol.for("adk:delegates-to");
