import type { ZodType, z } from "zod";
import type { ToolContext } from "../../domain/tool/tool-context";

/**
 * A tool an application writes as a class of its own.
 *
 * `@Tool` already makes the class a provider, and the runtime calls `execute` by name.
 * What extending this adds is the compiler: a class that forgot the method stops being a
 * tool while it is being written instead of when the module composes, and the input
 * arrives typed by the schema the decorator declared, so the shape is described once.
 *
 * ```ts
 * const schema = z.object({ orderId: z.string() });
 *
 * @Tool({ name: "find_order", description: "Finds an order.", schema, effect: "read" })
 * export class FindOrderTool extends AdkTool<typeof schema> {
 *   public constructor(private readonly orders: OrderService) {
 *     super();
 *   }
 *
 *   public execute(input: z.infer<typeof schema>): unknown {
 *     return this.orders.find(input.orderId);
 *   }
 * }
 * ```
 *
 * The two arguments come from different places and the difference is the point. `input` is
 * what the model decided, already parsed by the schema, so keys it invented outside the
 * schema are gone before the method runs. `context` is what the run knows: the session, the
 * call and the signal that says nobody is waiting for the answer anymore. Anything the
 * model must not choose, a tenant id being the usual one, belongs in the second.
 *
 * A tool declared as a method on an agent has the same two arguments and nothing to extend,
 * since it is already inside a class. `@Tool` types that method against the schema too.
 */
export abstract class AdkTool<TSchema extends ZodType = ZodType> {
	/** What it answers goes back to the model, and a promise is awaited before that. */
	public abstract execute(input: z.infer<TSchema>, context: ToolContext): unknown;
}
