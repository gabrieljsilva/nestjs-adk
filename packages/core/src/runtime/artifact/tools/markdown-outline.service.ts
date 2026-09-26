const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE = /^(```|~~~)/;

export class MarkdownOutline {
	public isMarkdown(text: string): boolean {
		return this.readHeadings(text).length > 0;
	}

	public build(text: string): Record<string, unknown> {
		const headings = this.readHeadings(text);
		return { lines: text.split("\n").length, headings };
	}

	private readHeadings(text: string): Record<string, unknown>[] {
		const headings: Record<string, unknown>[] = [];
		let fenced = false;
		const lines = text.split("\n");
		for (let at = 0; at < lines.length; at += 1) {
			const line = lines[at] ?? "";
			if (FENCE.test(line)) {
				fenced = !fenced;
				continue;
			}
			if (fenced) continue;
			const match = HEADING.exec(line);
			if (match === null) continue;
			headings.push({ level: (match[1] ?? "#").length, title: match[2] ?? "", line: at + 1 });
		}
		return headings;
	}
}
