import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { CREDIT, CREDITED } from "../../scripts/credit.mjs";

// Runs in Node, with no browser: every image by the author carries the credit (scripts/credit.mjs), readable as XMP

for (const [file] of CREDITED) {
  test(`${file} carries the author's credit`, async () => {
    const xmp = file.endsWith(".svg")
      ? readFileSync(file, "utf8")
      : (await sharp(file).metadata()).xmp?.toString("utf8") ?? "";
    expect(xmp).toContain(`<dc:creator><rdf:Seq><rdf:li>${CREDIT.creator}</rdf:li></rdf:Seq></dc:creator>`);
    expect(xmp).toContain(`<photoshop:AuthorsPosition>${CREDIT.title}</photoshop:AuthorsPosition>`);
    expect(xmp).toContain(`<photoshop:Credit>${CREDIT.line}</photoshop:Credit>`);
    expect(xmp).toContain(CREDIT.copyright);
    expect(xmp).toContain("<xmpRights:Marked>True</xmpRights:Marked>");
    expect(xmp).toContain(`<xmpRights:WebStatement>${CREDIT.site}</xmpRights:WebStatement>`);
    // and the picture still decodes
    expect((await sharp(file).metadata()).width).toBeGreaterThan(0);
  });
}
