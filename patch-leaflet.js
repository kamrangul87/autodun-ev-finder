// /patch-leaflet.js
import fs from "fs";
import path from "path";

const leafletPath = "./node_modules/leaflet";
if (!fs.existsSync(leafletPath)) {
  console.error("❌ Leaflet not installed — run npm install leaflet first");
  process.exit(1);
}

const cssPath = path.join(leafletPath, "dist", "leaflet.css");
if (!fs.existsSync(cssPath)) {
  console.error("❌ leaflet.css missing — reinstall leaflet");
  process.exit(1);
}

console.log("✅ Leaflet verified and css available at:", cssPath);
