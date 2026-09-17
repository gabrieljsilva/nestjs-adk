import type { ContextWindowUnknown } from "../../domain/context/context-window-unknown.value-object";
import { NoticeSink } from "../notice/notice-sink.contract";

/**
 * Where a context notice goes, such as a window nobody could measure.
 *
 * It is a `NoticeSink` like the other two: off the path of every decision, so nothing it
 * does, including failing, changes what the runtime does next. See [[NoticeSink]] for what
 * the family promises.
 */
export abstract class ContextNoticeSink extends NoticeSink<ContextWindowUnknown> {}
