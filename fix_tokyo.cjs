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

// Tokyo area corrections verified via web search
const fixes = {
  // id 2: 新宿御苑 -> 35.68528, 139.70972 ✓ current is close (35.6852, 139.71) OK
  // id 8: 新宿 -> 35.6938, 139.7034 ✓ OK
  // id 9: 吉祥寺 -> 35.7031, 139.5798 ✓ OK
  // id 10: 東京タワー -> 35.6586, 139.7454 ✓ OK  
  // id 18: 浅草 -> 35.7147, 139.7967 (current: 35.7148) ✓ OK
  
  // id 31: 川崎工場夜景 -> 千鳥町エリア 35.5233, 139.7603 (current: 35.5308, 139.7029 少しズレ)
  31: { lat: 35.5233, lng: 139.7603 },
  
  // id 52: もんじゃ -> 月島もんじゃストリート 35.6646, 139.7832 (current: 35.662, 139.781 少しズレ)
  52: { lat: 35.6646, lng: 139.7832 },
  
  // id 77: 東京コミコン -> 幕張メッセ 35.6483, 140.0352 (current: 35.6482, 140.034) ✓ OK
  
  // id 44: 高尾山 -> verified 35.6251, 139.2435 ✓ OK
  // id 3: 熱海 -> 35.0964, 139.071 ✓ OK
  // id 4: 秦野七福神 -> 35.3727, 139.221 ✓ OK
  // id 7: 江ノ島 -> 35.3005, 139.481 ✓ OK
  // id 22: 箱根 -> 35.2326, 139.107 ✓ OK
  // id 32: 鍋割山 -> 35.4439, 139.1415 ✓ OK
  // id 49: 寿司 -> 35.6748, 139.6828 ✓ (渋谷/新宿エリア) OK
  // id 60: 巾着田 -> 35.8832, 139.3111 ✓ OK
  // id 11: 濃溝の滝 -> 35.1853, 140.0595 ✓ OK
  // id 12: あしかがフラワーパーク -> 36.3143, 139.519 ✓ OK
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
console.log(`\nDone! Updated ${updatedCount} Tokyo-area locations.`);
