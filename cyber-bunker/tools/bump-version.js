// Bumps the content version after any change to the app or its content.
// Updates content/version.json and the VERSION in sw.js, which tells installed copies of the app
// that an update is ready. Usage: node tools/bump-version.js "What changed"
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const vFile = path.join(root, "content", "version.json"), swFile = path.join(root, "sw.js");
const v = JSON.parse(fs.readFileSync(vFile, "utf8"));
v.version = (Number(v.version) || 0) + 1;
v.date = new Date().toLocaleDateString("en-CA");
v.note = process.argv.slice(2).join(" ") || v.note || "";
fs.writeFileSync(vFile, JSON.stringify(v, null, 1) + "\n");
const sw = fs.readFileSync(swFile, "utf8");
if (!/const VERSION = \d+;/.test(sw)) { console.error("Couldn't find const VERSION in sw.js"); process.exit(1); }
fs.writeFileSync(swFile, sw.replace(/const VERSION = \d+;/, `const VERSION = ${v.version};`));
console.log(`Content version is now ${v.version} (${v.date}).`);
