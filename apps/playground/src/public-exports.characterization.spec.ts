import * as core from "@nestjs-adk/core";
import * as google from "@nestjs-adk/google";
import * as mcp from "@nestjs-adk/mcp";
import * as testing from "@nestjs-adk/testing";

describe("public package export characterization", () => {
	it("snapshots core runtime exports", () => {
		expect(Object.keys(core).sort()).toMatchSnapshot();
	});

	it("snapshots Google adapter exports", () => {
		expect(Object.keys(google).sort()).toMatchSnapshot();
	});

	it("snapshots MCP adapter exports", () => {
		expect(Object.keys(mcp).sort()).toMatchSnapshot();
	});

	it("snapshots testing support exports", () => {
		expect(Object.keys(testing).sort()).toMatchSnapshot();
	});
});
