import type { Actor } from "../../domain/tool/access/actor.value-object";
import type { AdkAccessPolicy } from "../../domain/tool/access/adk-access.policy";
import { OpenAccessPolicy } from "../../domain/tool/access/open-access.policy";
import type { ToolInvocation } from "../../domain/tool/invocation/tool-invocation.value-object";
import type { ToolDefinition } from "../../domain/tool/tool-definition.value-object";
import { ToolAdmission } from "./tool-admission.service";

export class ToolGate {
	public constructor(private readonly access: AdkAccessPolicy = new OpenAccessPolicy()) {}

	public async admit(
		tool: ToolDefinition,
		invocation: ToolInvocation,
		actor: Actor | undefined,
	): Promise<ToolAdmission> {
		const parsed = tool.schema.parse(invocation.args);
		if (!parsed.isValid) return ToolAdmission.invalid(parsed.reason);

		const access = await this.access.decide(tool, invocation, actor);
		return access.isGranted ? ToolAdmission.admitted(parsed.values) : ToolAdmission.denied(access.reason);
	}
}
