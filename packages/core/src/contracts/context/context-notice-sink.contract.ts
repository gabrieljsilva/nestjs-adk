import type { ArtifactsNotDurable } from "../../domain/artifact/artifacts-not-durable.notice";
import type { ContextWindowUnknown } from "../../domain/context/context-window-unknown.value-object";
import { NoticeSink } from "../notice/notice-sink.contract";

/**
 * What the runtime observes about what a model is going to read. Every member carries a
 * `message`; `instanceof` tells them apart.
 */
export type ContextNotice = ContextWindowUnknown | ArtifactsNotDurable;

/**
 * Where a context notice goes, such as a window nobody could measure or an artifact store
 * that dies with the process. Like every {@link NoticeSink}, it is off the path of a
 * decision. The context is absent for a notice produced while the runtime was composed.
 */
export abstract class ContextNoticeSink extends NoticeSink<ContextNotice> {}
