import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const svg = await readFile(new URL("../src/app/icon.svg", import.meta.url));
await mkdir(new URL("../public/icons/", import.meta.url), { recursive: true });
const out = (name) => fileURLToPath(new URL(`../public/icons/${name}`, import.meta.url));

for (const size of [192, 512]) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(out(`icon-${size}.png`));
}
// Maskable: pad to the 80% safe zone on the brand color.
const inner = await sharp(svg, { density: 384 }).resize(410, 410).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#d9602f" } })
  .composite([{ input: inner, gravity: "center" }])
  .png()
  .toFile(out("maskable-512.png"));
