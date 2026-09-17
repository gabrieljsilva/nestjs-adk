import { createHash } from "node:crypto";
import { McpInvalidSourceNameError } from "./errors/mcp-invalid-source-name.error";

/** Same shape Claude Code and Cursor use, so an external tool is recognizable at a glance. */
const PREFIX = "mcp";
/** What a provider will accept as a function name, and what is safe to repeat in a log line. */
const USABLE = /^[A-Za-z0-9_-]+$/;
/** OpenAI, Anthropic and Gemini all stop at 64 characters for a function name. */
const LIMIT = 64;
/** Enough of a digest that two names that were shortened to the same prefix still differ. */
const DIGEST = 8;
const JOIN = "__";
/** Leaves room for `mcp__`, the two separators, one character of tool, and the digest. */
const SOURCE_LIMIT = LIMIT - PREFIX.length - JOIN.length * 2 - 1 - (DIGEST + 1);

/**
 * The name a tool of one source is offered to the model under.
 *
 * The source segment is the connection's identity rather than the server's, which is what lets the
 * same integration be installed twice under two accounts: two sources named `github-7` and
 * `github-9` publish two distinct, stable sets of tool names, and the model can say which account
 * it means. That only holds while the segment is unique per installation, so the name is validated
 * here instead of being repaired silently.
 */
export class McpToolName {
	private constructor(public readonly source: string) {}

	/**
	 * @throws McpInvalidSourceNameError when the name is empty, too long, or carries anything but
	 * letters, digits, `_` and `-`. A name is rejected rather than normalized because normalizing
	 * collapses two installations onto one prefix, which is the collision this exists to prevent.
	 */
	public static forSource(source: string): McpToolName {
		if (source.length === 0) throw new McpInvalidSourceNameError(source, "it is empty");
		if (!USABLE.test(source)) {
			throw new McpInvalidSourceNameError(source, "only letters, digits, `_` and `-` are allowed");
		}
		if (source.length > SOURCE_LIMIT) {
			throw new McpInvalidSourceNameError(source, `it is longer than ${SOURCE_LIMIT} characters`);
		}
		return new McpToolName(source);
	}

	/** Whether a name the server published can be declared and logged at all. */
	public static isUsable(tool: string): boolean {
		return USABLE.test(tool) && tool.length <= LIMIT;
	}

	/**
	 * The qualified name, `mcp__<source>__<tool>`, shortened deterministically when the three
	 * segments together pass the 64 characters providers accept: the first `64 - 9` characters plus
	 * `_` and eight hexadecimal digits of the full name's SHA-256. Truncating alone would let two
	 * long tools of one server answer to the same name; the digest keeps them apart, and being a
	 * pure function of the full name it is the same on every run. Refusing the tool instead would
	 * cost the integration a capability over a naming limit, and refusing the declaration would cost
	 * the turn every other tool in it.
	 */
	public qualify(tool: string): string {
		const full = `${PREFIX}${JOIN}${this.source}${JOIN}${tool}`;
		if (full.length <= LIMIT) return full;
		const digest = createHash("sha256").update(full).digest("hex").slice(0, DIGEST);
		return `${full.slice(0, LIMIT - DIGEST - 1)}_${digest}`;
	}
}
