import type { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import type { AttachmentReference } from "../../domain/model/attachment/attachment-reference.value-object";
import type { SessionContext } from "../../domain/run/session-context.value-object";
import type { SessionRepository } from "../session/session-repository.service";
import type { AttachmentStore } from "./attachment-store.service";

export class AttachArtifactUseCase {
	public constructor(
		private readonly sessions: SessionRepository,
		private readonly attachments: AttachmentStore,
	) {}

	public async execute(context: SessionContext, content: ArtifactContent): Promise<AttachmentReference> {
		await this.sessions.findOrFail(context);
		return await this.attachments.attach(context, content);
	}
}
