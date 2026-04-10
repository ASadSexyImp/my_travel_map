const fs = require('fs');

const fileContent = fs.readFileSync('src/parsedLocations.js', 'utf-8');
let prefix = "";
let jsonStr = fileContent;
if (jsonStr.startsWith("//")) {
  const parts = jsonStr.split('\n');
  prefix = parts[0] + '\n';
  jsonStr = parts.slice(1).join('\n');
}
jsonStr = jsonStr.replace('export const locations = ', '').trim();
let locations = JSON.parse(jsonStr.replace(/;\s*$/, ''));

// Fine-tuned coordinate fixes after web search verification
const fixes = {
  7:  { lat: 35.2997, lng: 139.4803 }, // 江ノ島 (Wikipedia exact)
  22: { lat: 35.1894, lng: 139.0247 }, // 箱根 (Wikipedia exact)
  60: { lat: 35.8807, lng: 139.3115 }, // 巾着田 (Navitime exact)
};

let updatedCount = 0;
locations = locations.map(loc => {
  if (fixes[loc.id]) {
    const c = fixes[loc.id];
    console.log(`  Fixed: [${loc.id}] ${loc.name}: (${loc.lat}, ${loc.lng}) -> (${c.lat}, ${c.lng})`);
    loc.lat = c.lat;
    loc.lng = c.lng;
    updatedCount++;
  }
  return loc;
});

const newContent = prefix + 'export const locations = ' + JSON.stringify(locations, null, 2) + ';\n';
fs.writeFileSync('src/parsedLocations.js', newContent);
console.log(`\nDone! Updated ${updatedCount} locations.`);
