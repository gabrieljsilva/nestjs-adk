import type { ArtifactsNotDurable } from "../../domain/artifact/artifacts-not-durable.notice";
import type { ContextWindowUnknown } from "../../domain/context/context-window-unknown.value-object";
import { NoticeSink } from "../notice/notice-sink.contract";

/**
 * Everything the runtime observes about what a model is going to read: a window nobody
 * declared, and content moved somewhere a second process could not follow it to.
 *
 * They are one type because they are one subject and one audience. A sink that renders a
 * notice reads `message` off any of them, and a sink that wants to tell them apart uses
 * `instanceof` on a class the core exports.
 */
export type ContextNotice = ContextWindowUnknown | ArtifactsNotDurable;

/**
 * Where a context notice goes, such as a window nobody could measure or an artifact store
 * that dies with the process.
 *
 * It is a `NoticeSink` like the other two: off the path of every decision, so nothing it
 * does, including failing, changes what the runtime does next. See [[NoticeSink]] for what
 * the family promises.
 *
 * The context is absent for a notice produced while the runtime was being composed, because
 * no conversation exists yet to name.
 */
export abstract class ContextNoticeSink extends NoticeSink<ContextNotice> {}
