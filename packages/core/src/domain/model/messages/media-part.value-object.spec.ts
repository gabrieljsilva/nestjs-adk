import { describe, expect, it } from "vitest";
import { MediaLimits } from "../descriptor/media-limits.value-object";
import { MalformedMediaError } from "../errors/malformed-media.error";
import { MediaTooLargeError } from "../errors/media-too-large.error";
import { UnreachableMediaUrlError } from "../errors/unreachable-media-url.error";
import { UnsupportedMediaTypeError } from "../errors/unsupported-media-type.error";
import { MediaPart } from "./media-part.value-object";

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
		const limits = new MediaLimits(8, 1024, 1024);

		expect(() => MediaPart.image("image/png", PIXEL, limits)).toThrow(MediaTooLargeError);
	});

	it("refuses an image that only overflows once decoded", () => {
		const limits = new MediaLimits(1024, 4, 1024);

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

	it("refuses an address only this process can see, naming the host", () => {
		const unreachable = [
			"http://localhost:3000/uploads/1.png",
			"http://app.localhost/1.png",
			"http://127.0.0.1/1.png",
			"http://10.0.0.5/1.png",
			"http://192.168.0.10/1.png",
			"http://172.16.0.1/1.png",
			"http://169.254.1.1/1.png",
			"http://0.0.0.0/1.png",
			"http://[::1]:3000/1.png",
			"http://[::]/1.png",
			"http://[::ffff:127.0.0.1]/1.png",
			"http://[::ffff:192.168.0.10]/1.png",
			"http://[fd12::1]/1.png",
			"http://[fe80::1]/1.png",
			"http://minio.local/1.png",
			"http://storage.internal/1.png",
		];

		for (const url of unreachable) {
			expect(() => MediaPart.link(url, "image/png"), url).toThrow(UnreachableMediaUrlError);
		}
	});

	it("still takes a public address, including ones that merely look numeric", () => {
		expect(MediaPart.link("http://172.15.0.1/1.png", "image/png").isRemote).toBe(true);
		expect(MediaPart.link("http://172.32.0.1/1.png", "image/png").isRemote).toBe(true);
		expect(MediaPart.link("https://8.8.8.8/1.png", "image/png").isRemote).toBe(true);
		expect(MediaPart.link("http://[::ffff:8.8.8.8]/1.png", "image/png").isRemote).toBe(true);
	});

	it("takes a private address when the limits allow it, for a model that can reach it", () => {
		const limits = MediaLimits.byDefault().allowingPrivateHosts();

		expect(MediaPart.link("http://localhost:3000/uploads/1.png", "image/png", limits).isRemote).toBe(true);
	});
});
