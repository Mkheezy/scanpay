import { copyFile } from "node:fs/promises";
import { DEMO_ASSETS } from "./demo-assets.mjs";
for (const file of DEMO_ASSETS)
  await copyFile(
    new URL("../site/" + file, import.meta.url),
    new URL("../backend/public/" + file, import.meta.url),
  );
console.log("Synced the presentation into the local backend.");
