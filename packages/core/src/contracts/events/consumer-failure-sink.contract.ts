import type { ConsumerFailed } from "../../domain/event/consumer-failed.notice";
import { NoticeSink } from "../notice/notice-sink.contract";

/**
 * Where the fact that a consumer did not handle an event goes. The run carries on either
 * way; like every {@link NoticeSink}, nothing this does changes what the runtime does next.
 * The context is absent when a consumer fails while being flushed at shutdown.
 */
export abstract class ConsumerFailureSink extends NoticeSink<ConsumerFailed> {}
