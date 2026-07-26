import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Injectable } from "@nestjs/common";
import { PricingStorage } from "../abstracts/pricing-storage";
import type { PricingCatalog } from "../pricing/pricing-types";

export interface FileSystemPricingStorageOptions {
	/** Catalog file path. Default: `.cache/adk-pricing.json` under the process working directory. */
	path?: string;
}

/** Survives a restart, but not a fresh container. Writes through a temp file so a crash never leaves half a catalog. */
@Injectable()
export class FileSystemPricingStorage extends PricingStorage {
	private readonly path: string;

	public constructor(options: FileSystemPricingStorageOptions = {}) {
		super();
		this.path = options.path ?? join(process.cwd(), ".cache", "adk-pricing.json");
	}

	/** A missing file is the normal first boot; anything else (corrupt content, permissions) propagates so the source logs it. */
	public async read(): Promise<PricingCatalog | undefined> {
		try {
			return JSON.parse(await readFile(this.path, "utf8")) as PricingCatalog;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
			throw error;
		}
	}

	public async write(catalog: PricingCatalog): Promise<void> {
		await mkdir(dirname(this.path), { recursive: true });
		// random name + "wx" + 0600: a predictable temp in a shared directory is a symlink waiting to be planted
		const temp = `${this.path}.${randomBytes(8).toString("hex")}.tmp`;
		try {
			await writeFile(temp, JSON.stringify(catalog), { encoding: "utf8", flag: "wx", mode: 0o600 });
			await rename(temp, this.path);
		} catch (error) {
			await rm(temp, { force: true });
			throw error;
		}
	}
}
