import { describe, expect, it } from "vitest";
import { MalformedMediaError } from "./errors/malformed-media.error";
import { MediaTooLargeError } from "./errors/media-too-large.error";
import { UnsupportedMediaTypeError } from "./errors/unsupported-media-type.error";
import { MediaLimits } from "./media-limits";
import { MediaPart } from "./media-part";

const PIXEL = "iVBORw0KGgo=";
const UNPADDED = "iVBORw0KGgoA";

describe("MediaPart", () => {
	it("carries the media type and the encoded bytes", () => {
		const part = MediaPart.image("image/png", PIXEL);

		expect(part.mediaType).toBe("image/png");
		expect(part.base64).toBe(PIXEL);
	});

	it("normalizes the declared type, because a header is not case sensitive", () => {
		expect(MediaPart.image(" IMAGE/PNG ", PIXEL).mediaType).toBe("image/png");
	});

	it("takes a data URL, which is the shape a browser hands over", () => {
		const part = MediaPart.image("", `data:image/png;base64,${PIXEL}`);

		expect(part.mediaType).toBe("image/png");
		expect(part.base64).toBe(PIXEL);
	});

	it("refuses a data URL whose type disagrees with the declared one", () => {
		expect(() => MediaPart.image("image/jpeg", `data:image/png;base64,${PIXEL}`)).toThrow(MalformedMediaError);
	});

	it("refuses a data URL that never says it is base64", () => {
		expect(() => MediaPart.image("", `data:image/png,${PIXEL}`)).toThrow(MalformedMediaError);
	});

	it("refuses a type no provider here accepts", () => {
		expect(() => MediaPart.image("image/tiff", PIXEL)).toThrow(UnsupportedMediaTypeError);
	});

	it("refuses base64 an encoder would never have written", () => {
		expect(() => MediaPart.image("image/png", "not base64!")).toThrow(MalformedMediaError);
		expect(() => MediaPart.image("image/png", "aGk")).toThrow(MalformedMediaError);
		expect(() => MediaPart.image("image/png", "aG=k")).toThrow(MalformedMediaError);
		expect(() => MediaPart.image("image/png", "")).toThrow(MalformedMediaError);
	});

	it("refuses an image over the encoded ceiling", () => {
		const limits = MediaLimits.of(8, 1024, 1024);

		expect(() => MediaPart.image("image/png", PIXEL, limits)).toThrow(MediaTooLargeError);
	});

	it("refuses an image that only overflows once decoded", () => {
		const limits = MediaLimits.of(1024, 4, 1024);

		expect(() => MediaPart.image("image/png", PIXEL, limits)).toThrow(MediaTooLargeError);
	});

	it("measures the payload and the decoded size without decoding anything", () => {
		const part = MediaPart.image("image/png", PIXEL);

		expect(part.encodedBytes).toBe(12);
		expect(part.decodedBytes).toBe(8);
	});

	it("counts against a context as a projection, so a large image cannot take it over", () => {
		const small = MediaPart.image("image/png", UNPADDED);
		const large = MediaPart.image("image/png", UNPADDED.repeat(1000));

		expect(small.characters).toBe(large.characters);
		expect(large.characters).toBeLessThan(large.encodedBytes);
	});

	it("knows an image from anything else", () => {
		expect(MediaPart.image("image/png", PIXEL).isImage).toBe(true);
	});

	it("writes itself back as the data URL it came from", () => {
		expect(MediaPart.image("image/png", PIXEL).toUrl()).toBe(`data:image/png;base64,${PIXEL}`);
	});

	it("takes an image the provider fetches for itself", () => {
		const part = MediaPart.link("https://cdn.example/photo.png", "image/png");

		expect(part.isRemote).toBe(true);
		expect(part.url).toBe("https://cdn.example/photo.png");
		expect(part.toUrl()).toBe("https://cdn.example/photo.png");
		expect(part.base64).toBe("");
		expect(part.encodedBytes).toBe(0);
	});

	it("still refuses a type no provider here accepts, link or not", () => {
		expect(() => MediaPart.link("https://cdn.example/x.tiff", "image/tiff")).toThrow(UnsupportedMediaTypeError);
	});

	it("refuses an address nothing can fetch", () => {
		expect(() => MediaPart.link("not a url", "image/png")).toThrow(MalformedMediaError);
		expect(() => MediaPart.link("file:///etc/passwd", "image/png")).toThrow(MalformedMediaError);
		expect(() => MediaPart.link(`data:image/png;base64,${PIXEL}`, "image/png")).toThrow(MalformedMediaError);
	});

	it("costs the same in a context whether it travels or is fetched", () => {
		const inline = MediaPart.image("image/png", PIXEL);
		const linked = MediaPart.link("https://cdn.example/photo.png", "image/png");

		expect(linked.characters).toBe(inline.characters);
	});
});
