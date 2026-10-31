/*
  The author's credit inside the images MANUS serves: who made it, their title, the credit line, the rights
  and where they are stated, as XMP (what Google Images reads for Creator, Credit and Copyright). The
  wording and the packet are copied from karano.me (lib/credit.ts) rather than imported, so
  the two repos stay apart.

  Each file is credited in its own bytes, with nothing re-encoded: text chunks after a PNG's header, an
  XMP segment in a JPEG, an XMP chunk in a WebP, a <metadata> block in an SVG. A file that already carries
  the credit is left as it is, so this can run any time:

    node scripts/credit.mjs

  Not credited: the favicons, the hand-tracking model and wasm, the fonts, and the sounds in
  public/samples, which are renders of a synth's factory presets.
*/
import { readFileSync, writeFileSync } from "node:fs";

export const CREDIT = {
  creator: "Karan Oroumchi",
  title: "UI/UX engineer",
  line: "Karan Oroumchi, UI/UX engineer, karano.me",
  copyright: "© Karan Oroumchi. All rights reserved.",
  site: "https://karano.me",
};

const alt = (file) => readFileSync(file, "utf8").trim();

/** Every image by the author that the site serves, with what it shows */
export const CREDITED = [
  ["app/apple-icon.png", "The MANUS icon"],
  ["app/opengraph-image.jpg", alt("app/opengraph-image.alt.txt")],
  ["app/twitter-image.jpg", alt("app/twitter-image.alt.txt")],
  ["public/icons/icon-192.png", "The MANUS icon"],
  ["public/icons/icon-512.png", "The MANUS icon"],
  ["public/icons/icon-maskable-512.png", "The MANUS icon, full bleed"],
  ["public/manus-logo.png", "The MANUS icon"],
  ["public/manus-banner.png", "The MANUS banner"],
  ["public/manus-banner.svg", "The MANUS banner"],
  ["public/pwa/screen-wide.webp", "The stage, the beam keys and the deck on a laptop"],
  ["public/pwa/screen-narrow.webp", "MANUS on a phone"],
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const altText = (s) => `<rdf:Alt><rdf:li xml:lang="x-default">${esc(s)}</rdf:li></rdf:Alt>`;

/** The RDF inside the packet: who made it, their title, the credit line, the rights and where they're stated, and what it shows */
function xmpMeta(description) {
  return [
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"',
    ' xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/" xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/">',
    `<dc:creator><rdf:Seq><rdf:li>${esc(CREDIT.creator)}</rdf:li></rdf:Seq></dc:creator>`,
    `<photoshop:AuthorsPosition>${esc(CREDIT.title)}</photoshop:AuthorsPosition>`,
    `<photoshop:Credit>${esc(CREDIT.line)}</photoshop:Credit>`,
    `<dc:rights>${altText(CREDIT.copyright)}</dc:rights>`,
    "<xmpRights:Marked>True</xmpRights:Marked>",
    `<xmpRights:WebStatement>${CREDIT.site}</xmpRights:WebStatement>`,
    `<Iptc4xmpCore:CreatorContactInfo rdf:parseType="Resource"><Iptc4xmpCore:CiUrlWork>${CREDIT.site}</Iptc4xmpCore:CiUrlWork></Iptc4xmpCore:CreatorContactInfo>`,
    description ? `<dc:description>${altText(description)}</dc:description>` : "",
    "</rdf:Description></rdf:RDF></x:xmpmeta>",
  ].join("");
}

/** The XMP packet, as karano.me's xmpPacket() builds it */
export function xmpPacket(description) {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>${xmpMeta(description)}<?xpacket end="w"?>`;
}

/** Whether a file already carries the credit */
export const isCredited = (bytes) => Buffer.from(bytes).includes(`<photoshop:Credit>${esc(CREDIT.line)}</photoshop:Credit>`);

// PNG: iTXt chunks right after the header

let table;
function crc32(bytes) {
  table ??= Uint32Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let c = 0xffffffff;
  for (const b of bytes) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** One iTXt chunk: its keyword, then (uncompressed, no language) its text in UTF-8 */
function iTXt(keyword, text) {
  const key = Buffer.from(keyword, "latin1");
  const body = Buffer.from(text, "utf8");
  const out = Buffer.alloc(12 + key.length + 5 + body.length);
  out.writeUInt32BE(key.length + 5 + body.length, 0);
  out.write("iTXt", 4, "latin1");
  key.copy(out, 8);
  body.copy(out, 8 + key.length + 5);
  out.writeUInt32BE(crc32(out.subarray(4, out.length - 4)), out.length - 4);
  return out;
}

/** Author, Copyright, Description, Source and the XMP packet, after IHDR (always first, always 13 bytes, so from byte 33) */
export function creditPng(png, description) {
  const chunks = [
    iTXt("Author", CREDIT.creator),
    iTXt("Copyright", CREDIT.copyright),
    iTXt("Description", description),
    iTXt("Source", CREDIT.site),
    iTXt("XML:com.adobe.xmp", xmpPacket(description)),
  ];
  return Buffer.concat([png.subarray(0, 33), ...chunks, png.subarray(33)]);
}

// JPEG: an APP1 XMP segment after the JFIF and Exif segments

export function creditJpeg(jpg, description) {
  if (jpg[0] !== 0xff || jpg[1] !== 0xd8) throw new Error("not a JPEG");
  let at = 2;
  while (jpg[at] === 0xff && (jpg[at + 1] === 0xe0 || jpg[at + 1] === 0xe1)) at += 2 + jpg.readUInt16BE(at + 2);
  const body = Buffer.concat([Buffer.from("http://ns.adobe.com/xap/1.0/\0", "latin1"), Buffer.from(xmpPacket(description), "utf8")]);
  if (body.length + 2 > 0xffff) throw new Error("XMP packet too long for one JPEG segment");
  const head = Buffer.from([0xff, 0xe1, 0, 0]);
  head.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([jpg.subarray(0, at), head, body, jpg.subarray(at)]);
}

// WebP: an XMP chunk, announced in a VP8X header

function riffChunk(fourcc, data) {
  const head = Buffer.alloc(8);
  head.write(fourcc, 0, "latin1");
  head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}

export function creditWebp(webp, description) {
  if (webp.toString("latin1", 0, 4) !== "RIFF" || webp.toString("latin1", 8, 12) !== "WEBP") throw new Error("not a WebP");
  const chunks = [];
  for (let at = 12; at + 8 <= webp.length; ) {
    const size = webp.readUInt32LE(at + 4);
    chunks.push({ fourcc: webp.toString("latin1", at, at + 4), data: webp.subarray(at + 8, at + 8 + size) });
    at += 8 + size + (size % 2);
  }
  let vp8x = chunks.find((c) => c.fourcc === "VP8X");
  if (!vp8x) {
    const image = chunks[0];
    if (image?.fourcc !== "VP8 ") throw new Error("only simple lossy WebP files are handled");
    // the frame size sits after the 3-byte frame tag and the 3-byte start code, 14 bits each
    const width = image.data.readUInt16LE(6) & 0x3fff;
    const height = image.data.readUInt16LE(8) & 0x3fff;
    const data = Buffer.alloc(10);
    data.writeUIntLE(width - 1, 4, 3);
    data.writeUIntLE(height - 1, 7, 3);
    vp8x = { fourcc: "VP8X", data };
    chunks.unshift(vp8x);
  }
  vp8x.data = Buffer.from(vp8x.data);
  vp8x.data[0] |= 0x04; // XMP present
  chunks.push({ fourcc: "XMP ", data: Buffer.from(xmpPacket(description), "utf8") });
  const body = Buffer.concat([Buffer.from("WEBP", "latin1"), ...chunks.map((c) => riffChunk(c.fourcc, c.data))]);
  const head = Buffer.alloc(8);
  head.write("RIFF", 0, "latin1");
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

// SVG: a <metadata> block first inside <svg>

export function creditSvg(svg, description) {
  const text = svg.toString("utf8");
  const open = text.match(/<svg\b[^>]*>/);
  if (!open) throw new Error("not an SVG");
  const at = open.index + open[0].length;
  return Buffer.from(`${text.slice(0, at)}\n  <metadata>${xmpMeta(description)}</metadata>${text.slice(at)}`, "utf8");
}

const BY_EXT = { png: creditPng, jpg: creditJpeg, jpeg: creditJpeg, webp: creditWebp, svg: creditSvg };

/** Credits one file in place, unless it already carries the credit. Returns whether it changed */
export function creditFile(file, description) {
  const bytes = readFileSync(file);
  if (isCredited(bytes)) return false;
  const credit = BY_EXT[file.split(".").pop().toLowerCase()];
  if (!credit) throw new Error(`no credit writer for ${file}`);
  writeFileSync(file, credit(bytes, description));
  return true;
}

// Run as `node scripts/credit.mjs`, and not when a test or the screenshot script imports it (no import.meta, which
// the test runner's loader cannot read)
if (/scripts[\\/]credit\.mjs$/.test(process.argv[1] ?? "")) {
  for (const [file, description] of CREDITED) console.log(`${creditFile(file, description) ? "credited" : "already "} ${file}`);
}
