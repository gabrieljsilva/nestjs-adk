import type { Actor } from "../../domain/tool/actor";
import type { AdkAccessPolicy } from "../../domain/tool/adk-access-policy";
import { OpenAccessPolicy } from "../../domain/tool/open-access-policy";
import type { ToolDefinition } from "../../domain/tool/tool-definition";
import type { ToolInvocation } from "../../domain/tool/tool-invocation";
import { ToolAdmission } from "./tool-admission";

/**
 * The one door every tool call goes through before its handler runs: the arguments are parsed by
 * the tool's own schema, then the access policy is asked about this actor.
 *
 * It is a class of its own, rather than two lines inside the executor, because the executor is
 * not the only caller. An MCP server exposing the same tools admits a call through this same
 * gate, and that is what makes "an outside client cannot do what the agent could not" a property
 * of the code path instead of a discipline two modules have to keep in step.
 */
export class ToolGate {
	public constructor(private readonly access: AdkAccessPolicy = new OpenAccessPolicy()) {}

	public async admit(
		tool: ToolDefinition,
		invocation: ToolInvocation,
		actor: Actor | undefined,
	): Promise<ToolAdmission> {
		const parsed = tool.schema.parse(invocation.args);
		if (!parsed.isValid) return ToolAdmission.invalid(parsed.reason);
		if (tool.internal) return ToolAdmission.admitted(parsed.values);

		const access = await this.access.decide(tool, invocation, actor);
		return access.isGranted ? ToolAdmission.admitted(parsed.values) : ToolAdmission.denied(access.reason);
	}
}
