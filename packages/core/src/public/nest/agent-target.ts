/** A class an application decorated with `@Agent`. */
export type AgentClass = abstract new (...args: never[]) => unknown;

/**
 * One end of an edge, in whichever of the three ways an application has it at hand.
 *
 * The class is the form to prefer: renaming the agent follows automatically, the editor
 * finds the declaration, and a target that does not exist is a compile error rather than a
 * boot one. When two agents reach each other the class is not defined yet at the moment the
 * decorator runs, so it travels as a function and is called later, which is the same shape
 * an ORM uses for a relation that points back.
 *
 * A plain name still works, and is the only form available for an agent whose class this
 * module does not import. It is also what the model itself is offered, since `transfer_to_agent`
 * takes a name on the wire either way.
 *
 * ```ts
 * @TransfersTo(SalesAgent, () => WarrantyAgent, "plugin-agent")
 * ```
 */
export type AgentTarget = string | AgentClass | (() => AgentClass);
