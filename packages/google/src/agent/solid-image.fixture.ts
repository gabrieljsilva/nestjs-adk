import { deflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BIT_DEPTH = 8;
const COLOR_TYPE_RGB = 2;
const SIDE = 64;

/**
 * A solid colour square, encoded as a real PNG at test time.
 *
 * A suite that asks a provider what colour it sees needs an image the provider actually
 * decodes, and a base64 blob pasted into a file is something nobody can check by reading
 * it. Sixty four pixels of one colour is the smallest image with an unambiguous answer.
 */
export function solidPng(red: number, green: number, blue: number): string {
	const raw = Buffer.alloc(SIDE * (SIDE * 3 + 1));
	for (let row = 0; row < SIDE; row += 1) {
		const start = row * (SIDE * 3 + 1);
		raw[start] = 0;
		for (let column = 0; column < SIDE; column += 1) {
			const at = start + 1 + column * 3;
			raw[at] = red;
			raw[at + 1] = green;
			raw[at + 2] = blue;
		}
	}

	const header = Buffer.alloc(13);
	header.writeUInt32BE(SIDE, 0);
	header.writeUInt32BE(SIDE, 4);
	header[8] = BIT_DEPTH;
	header[9] = COLOR_TYPE_RGB;

	const png = Buffer.concat([
		SIGNATURE,
		chunk("IHDR", header),
		chunk("IDAT", deflateSync(raw)),
		chunk("IEND", Buffer.alloc(0)),
	]);
	return png.toString("base64");
}

function chunk(type: string, data: Buffer): Buffer {
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length, 0);
	const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(typed), 0);
	return Buffer.concat([length, typed, crc]);
}

const TABLE = buildTable();

function buildTable(): Uint32Array {
	const table = new Uint32Array(256);
	for (let index = 0; index < 256; index += 1) {
		let value = index;
		for (let bit = 0; bit < 8; bit += 1) {
			value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
		}
		table[index] = value >>> 0;
	}
	return table;
}

function crc32(buffer: Buffer): number {
	let crc = 0xffffffff;
	for (const byte of buffer) crc = ((TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8)) >>> 0;
	return (crc ^ 0xffffffff) >>> 0;
}
