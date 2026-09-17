/** A class an application decorated with `@Agent`. */
export type AgentClass = abstract new (...args: never[]) => unknown;

/**
 * One end of a transfer or delegation edge. Prefer the class: renaming follows automatically
 * and a target that does not exist is a compile error. Two agents that reach each other pass a
 * function, since the other class is still undefined while the decorator runs.
 *
 * A plain name is the only form for an agent whose class this module does not import, and it
 * is what the model is offered on the wire either way.
 */
export type AgentTarget = string | AgentClass | (() => AgentClass);
