const fs = require('fs');

const fileContent = fs.readFileSync('src/parsedLocations.js', 'utf-8');
// Keep the comment at the top if it exists
let prefix = "";
let jsonStr = fileContent;
if (jsonStr.startsWith("//")) {
  const parts = jsonStr.split('\n');
  prefix = parts[0] + '\n';
  jsonStr = parts.slice(1).join('\n');
}

jsonStr = jsonStr.replace('export const locations = ', '').trim();
let locations;
try {
  locations = JSON.parse(jsonStr.replace(/;\s*$/, ''));
} catch (e) {
  console.log("Error parsing", e);
  process.exit(1);
}

const updates = {
  23: { lat: 34.7456, lng: 137.9422 }, // 風鈴祭り -> 静岡 (袋井・法多山)
  34: { lat: 33.5215, lng: 130.5249 }, // 太宰府 -> 福岡
  45: { lat: 36.7327, lng: 138.4621 }, // 地獄谷 -> 長野
  65: { lat: 35.0594, lng: 135.7517 }, // 賀茂神社 -> 京都
  70: { lat: 34.6851, lng: 135.8430 }, // 鹿寄せ -> 奈良
  71: { lat: 37.5618, lng: 126.9468 }, // 梨花 -> 韓国
  84: { lat: 35.0392, lng: 135.7730 }, // 御手洗祭り -> 京都
  94: { lat: 33.5597, lng: 133.5311 }, // よさこい祭り -> 四国(高知)
  96: { lat: 35.0116, lng: 135.7681 }  // 時代祭 -> 京都
};

locations = locations.map(loc => {
  if (updates[loc.id]) {
    loc.lat = updates[loc.id].lat;
    loc.lng = updates[loc.id].lng;
  }
  return loc;
});

const newContent = prefix + 'export const locations = ' + JSON.stringify(locations, null, 2) + ';\n';
fs.writeFileSync('src/parsedLocations.js', newContent);
console.log("Updated parsedLocations.js successfully!");
