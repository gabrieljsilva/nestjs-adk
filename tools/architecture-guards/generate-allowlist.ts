import { GuardRunner } from "./src/guard-runner";

const baseline = new GuardRunner(process.cwd()).regenerate();

process.stdout.write(`allowlist regenerated with ${baseline.allowlist.entries.length} entries\n`);
for (const [rule, count] of baseline.allowlist.countByRule()) {
	process.stdout.write(`  ${rule}: ${count}\n`);
}
