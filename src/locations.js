// src/locations.js
// 緯度経度はGoogleマップ等で調べて入力してください
export const locations = [
  {
    id: 1,
    name: "東京・浅草",
    lat: 35.7147,
    lng: 139.7967,
    videoUrl: "https://www.youtube.com/embed/YOUR_VIDEO_ID_1", // YouTubeの埋め込みIDなど
    genre: "matsuri", // matsuri, nature, city, winter
    desc: "三社祭の熱気と神輿",
  },
  {
    id: 2,
    name: "京都・嵐山",
    lat: 35.0116,
    lng: 135.6680,
    videoUrl: "https://www.youtube.com/embed/YOUR_VIDEO_ID_2",
    genre: "nature",
    desc: "竹林の静寂と風の音",
  },
  {
    id: 3,
    name: "北海道・小樽",
    lat: 43.1907,
    lng: 140.9947,
    videoUrl: "https://www.youtube.com/embed/YOUR_VIDEO_ID_3",
    genre: "winter",
    desc: "雪あかりの路",
  },
  // ... ここに50個分を追加していきます
  // 地図の形を綺麗に出すため、主要都市のデータを入れると日本列島の形に見えてきます
];