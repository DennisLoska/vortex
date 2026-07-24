import { embedAllAssets } from "../services/embed";

console.log("Starting asset embedding...");
const result = await embedAllAssets();
console.log(`Done: ${result.embedded} embedded, ${result.skipped} skipped`);
