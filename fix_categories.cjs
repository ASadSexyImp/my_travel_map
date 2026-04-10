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

// Category corrections: id -> new categories array
// Only entries that need changes are listed
const categoryFixes = {
  // id 18: 浅草 -> 浅草寺がメイン、寺タグ追加
  18: { categories: ["都市", "伝統", "寺"], desc: "都市, 伝統, 寺" },
  // id 19: 恐山 -> 恐山菩提寺、霊場
  19: { categories: ["田舎", "寺"], desc: "田舎, 寺" },
  // id 22: 箱根 -> 温泉もメイン
  22: { categories: ["緑", "水", "温泉"], desc: "緑, 水, 温泉" },
  // id 28: 苔寺 -> 西芳寺(苔寺)は寺！
  28: { categories: ["緑", "伝統", "寺"], desc: "緑, 伝統, 寺" },
  // id 35: 別府地獄 -> 温泉がメイン
  35: { categories: ["温泉", "水"], desc: "温泉, 水" },
  // id 36: 瑠璃光院 -> 寺院
  36: { categories: ["寺", "伝統", "緑"], desc: "寺, 伝統, 緑" },
  // id 37: 比叡山 -> 延暦寺
  37: { categories: ["寺", "緑", "伝統"], desc: "寺, 緑, 伝統" },
  // id 38: 建仁寺 -> 空カテゴリを修正
  38: { categories: ["寺", "伝統"], desc: "寺, 伝統" },
  // id 39: 金閣寺 銀閣寺 -> 空カテゴリを修正
  39: { categories: ["寺", "伝統"], desc: "寺, 伝統" },
  // id 40: 出雲 -> 出雲大社は神社
  40: { categories: ["伝統", "神社"], desc: "伝統, 神社" },
  // id 41: 大久野島 -> うさぎ島、動物追加
  41: { categories: ["田舎", "島", "動物"], desc: "田舎, 島, 動物" },
  // id 45: 地獄谷 -> 温泉猿
  45: { categories: ["雪", "動物", "温泉"], desc: "雪, 動物, 温泉" },
  // id 49: 寿司 -> 空カテゴリを修正
  49: { categories: ["食"], desc: "食" },
  // id 50: 草津 -> 温泉がメイン
  50: { categories: ["温泉", "伝統"], desc: "温泉, 伝統" },
  // id 54: 山寺 -> 立石寺(寺)
  54: { categories: ["寺", "雪"], desc: "寺, 雪" },
  // id 58: 戸隠 -> 戸隠神社
  58: { categories: ["緑", "神社"], desc: "緑, 神社" },
  // id 59: 奈良井宿 -> 伝統的な宿場
  59: { categories: ["田舎", "伝統"], desc: "田舎, 伝統" },
  // id 61: 日光 -> 東照宮(神社) + 輪王寺(寺)
  61: { categories: ["田舎", "神社", "寺", "伝統"], desc: "田舎, 神社, 寺, 伝統" },
  // id 62: 長崎ランタン -> 夜の祭り
  62: { categories: ["祭", "夜"], desc: "祭, 夜" },
  // id 68: 浜松祭り -> 祭タグがない
  68: { categories: ["祭", "伝統"], desc: "祭, 伝統" },
  // id 69: 那智火祭り -> 火、祭、神社
  69: { categories: ["火", "祭", "神社"], desc: "火, 祭, 神社" },
  // id 71: 梨花 -> 空カテゴリ、韓国の大学/都市
  71: { categories: ["都市"], desc: "都市" },
  // id 73: きょんぼっくん(景福宮) -> 宮殿、城タグ
  73: { categories: ["伝統", "城"], desc: "伝統, 城" },
  // id 75: 関ヶ原 -> 歴史イベント
  75: { categories: ["祭", "伝統"], desc: "祭, 伝統" },
  // id 76: 長良川 鵜飼 -> 水、伝統、動物
  76: { categories: ["水", "伝統", "動物"], desc: "水, 伝統, 動物" },
  // id 78: 台北 九分 -> 都市、夜景が有名
  78: { categories: ["都市", "夜"], desc: "都市, 夜" },
  // id 79: 台南ランタン -> 夜もメイン
  79: { categories: ["祭", "夜"], desc: "祭, 夜" },
  // id 83: 高千穂 -> 高千穂神社、神話
  83: { categories: ["緑", "神社", "水"], desc: "緑, 神社, 水" },
  // id 88: 岩手さんさ -> 夜の祭り
  88: { categories: ["祭", "夜"], desc: "祭, 夜" },
  // id 92: 飛騨高山祭 -> 伝統もメイン
  92: { categories: ["祭", "伝統"], desc: "祭, 伝統" },
  // id 93: 平安神宮祭り -> 神社タグ
  93: { categories: ["祭", "神社"], desc: "祭, 神社" },
  // id 96: 時代祭 -> 空カテゴリを修正
  96: { categories: ["祭", "伝統"], desc: "祭, 伝統" },
  // id 97: 鞍馬火祭り -> 空カテゴリを修正
  97: { categories: ["祭", "火", "神社", "夜"], desc: "祭, 火, 神社, 夜" },
};

let updatedCount = 0;
locations = locations.map(loc => {
  if (categoryFixes[loc.id]) {
    const fix = categoryFixes[loc.id];
    const oldCats = JSON.stringify(loc.categories);
    const newCats = JSON.stringify(fix.categories);
    if (oldCats !== newCats) {
      console.log(`  [${loc.id}] ${loc.name}: ${oldCats} -> ${newCats}`);
      loc.categories = fix.categories;
      loc.desc = fix.desc;
      updatedCount++;
    }
  }
  return loc;
});

const newContent = prefix + 'export const locations = ' + JSON.stringify(locations, null, 2) + ';\n';
fs.writeFileSync('src/parsedLocations.js', newContent);
console.log(`\nDone! Updated categories for ${updatedCount} locations.`);
