const fs = require('fs');
const map = JSON.parse(fs.readFileSync('functions/lib/index.js.map', 'utf8'));
const srcIdx = map.sources.findIndex(s => s.includes('index.ts'));
if (srcIdx !== -1 && map.sourcesContent) {
  fs.writeFileSync('functions/src/index.ts', map.sourcesContent[srcIdx]);
  console.log("Restored index.ts!");
} else {
  console.log("No sourcesContent found, sources:", map.sources);
}
