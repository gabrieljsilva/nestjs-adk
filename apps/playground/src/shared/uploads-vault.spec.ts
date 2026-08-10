import { MediaPart } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { UploadsVault } from "./uploads-vault";

const PIXEL = "iVBORw0KGgo=";

describe("UploadsVault", () => {
	it("answers the file an id names", () => {
		const vault = new UploadsVault();
		const file = MediaPart.image("image/png", PIXEL);

		vault.put("u-42", file);

		expect(vault.find("u-42")).toBe(file);
	});

	it("answers nothing for an id nobody uploaded", () => {
		expect(new UploadsVault().find("u-404")).toBeUndefined();
	});
});
