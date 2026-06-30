// src/productLinks.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 商品コード → 商品ページURL マッピング
// 新商品追加時はここにエントリを追加する
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type StoreLinks = {
  rakuten?: string;
  yahoo?: string;
  amazon?: string;
};

const PRODUCT_LINKS: Record<string, StoreLinks> = {
  // ━━━ リュック・バッグ ━━━
  "outdoor-001": {
    rakuten: "https://item.rakuten.co.jp/nagapo/20230207-backpack-cover/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/20210701-backpack-cover.html",
  },

  // ━━━ ペット用品 ━━━
  "pet-003": {
    rakuten: "https://item.rakuten.co.jp/nagapo/20230222-mannerbelt/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/220405-pet-mannerbelt.html",
    amazon: "https://www.amazon.co.jp/dp/B0FD9KDPT7",
  },
  "pet-008": {
    rakuten: "https://item.rakuten.co.jp/nagapo/pet-022/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/20220902-cold-petmat.html",
  },
  "pet-010": {
    rakuten: "https://item.rakuten.co.jp/nagapo/pet-022/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/20220902-cold-petmat.html",
  },
  "m-pet018m": {
    rakuten: "https://item.rakuten.co.jp/nagapo/pet-022/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/20220902-cold-petmat.html",
  },
  "pet-011shibaver": {
    rakuten: "https://item.rakuten.co.jp/nagapo/pet-011shibaver/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/pet-011shibaver.html",
  },
  "pet-012": {
    rakuten: "https://item.rakuten.co.jp/nagapo/pet-012/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/20221227-dogwear-knit.html",
  },
  "pet-013": {
    rakuten: "https://item.rakuten.co.jp/nagapo/pet-013/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/20230215-petwear-fleece.html",
  },
  "pet-017": {
    rakuten: "https://item.rakuten.co.jp/nagapo/20230206-petmat-xl/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/210913-petsheet.html",
  },

  // ━━━ エプロン ━━━
  "apron-001": {
    rakuten: "https://item.rakuten.co.jp/nagapo/20230207-denim-apron/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/221012-denimapron.html",
  },
  "apron-002": {
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/apron-002.html",
  },

  // ━━━ サンダル・スリッパ ━━━
  "sandal-002": {
    rakuten: "https://item.rakuten.co.jp/nagapo/20230224-7color-sandal/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/220405-7color-sandal.html",
  },
  "sandal-002wakeari": {
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/sandal-002wakeari.html",
  },
  "sandal-004": {
    rakuten: "https://item.rakuten.co.jp/nagapo/20230320-balcony-sandal-7color/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/20230320-balcony-sandal-7color.html",
  },
  "sandal-004wakeari": {
    rakuten: "https://item.rakuten.co.jp/nagapo/sandal-004wakeari/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/sandal-004wakeari.html",
  },
  "sandal-007": {
    rakuten: "https://item.rakuten.co.jp/nagapo/sandal-007/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/sandal-007.html",
  },
  "sandal-007wakeari": {
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/sandal-007wakeari.html",
  },
  "sandal-008": {
    rakuten: "https://item.rakuten.co.jp/nagapo/sandal-008/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/sandal-008.html",
    amazon: "https://www.amazon.co.jp/dp/B0FDB8KLY7",
  },
  "sandal-008wakeari": {
    rakuten: "https://item.rakuten.co.jp/nagapo/sandal-008wakeari/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/sandal-008wakeari.html",
  },
  "sandal-101": {
    rakuten: "https://item.rakuten.co.jp/nagapo/sandal-101/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/sandal-101.html",
    amazon: "https://www.amazon.co.jp/dp/B0DP4F2CJC",
  },

  // ━━━ レディースファッション ━━━
  "ladiesfashion-19": {
    rakuten: "https://item.rakuten.co.jp/nagapo/ladiesfashion-19/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/ladiesfashion-19.html",
  },
  "ladiesfashion-002": {
    rakuten: "https://item.rakuten.co.jp/nagapo/20230207-bikini/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/20210629-bikini.html",
    amazon: "https://www.amazon.co.jp/dp/B0D94396LK",
  },
  "ladiesfashion-010": {
    rakuten: "https://item.rakuten.co.jp/nagapo/ladiesfashion-010/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/20220610-swimwear-wanpi-na002.html",
  },
  "ladiesfashion-013": {
    rakuten: "https://item.rakuten.co.jp/nagapo/ladiesfashion-013/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/ladiesfashion-013.html",
  },
  "ladiesfashion-015": {
    rakuten: "https://item.rakuten.co.jp/nagapo/ladiesfashion-015/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/ladiesfashion-015.html",
  },
  "ladiesfashion-020": {
    rakuten: "https://item.rakuten.co.jp/nagapo/ladiesfashion-020/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/ladiesfashion-020.html",
  },
  "ladiesfashion-021": {
    rakuten: "https://item.rakuten.co.jp/nagapo/ladiesfashion-021/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/adiesfashion-021.html",
  },

  // ━━━ メンズファッション ━━━
  "oem-shirt": {
    rakuten: "https://item.rakuten.co.jp/nagapo/oem-shirt/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/b07bm1g62g-yahoo.html",
    amazon: "https://www.amazon.co.jp/dp/B07D4BD6Y8",
  },
  "mensfashion-003-2": {
    rakuten: "https://item.rakuten.co.jp/nagapo/mensfashion-003-2/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/mensfashion-003-2.html",
    amazon: "https://www.amazon.co.jp/dp/B08L17H6B6",
  },

  // ━━━ その他 ━━━
  "mocomocodog": {
    rakuten: "https://item.rakuten.co.jp/nagapo/mocomocodog/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/mocomocodog.html",
  },
  "torecacaseoriginal001": {
    rakuten: "https://item.rakuten.co.jp/nagapo/torecacaseoriginal001/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/torecacaseoriginal001.html",
  },
  "torecacaseoriginal002": {
    rakuten: "https://item.rakuten.co.jp/nagapo/torecacaseoriginal002/",
    yahoo: "https://store.shopping.yahoo.co.jp/nagapo/torecacaseoriginal02.html",
  },
};

// ━━━ メルカリ（ショップページへのリンクのみ） ━━━
const MERCARI_SHOP_URL = "https://jp.mercari.com/shops/profile/fDPTsvfnSGCbHN5B2Xk7q4";

// ━━━ フォールバック検索URL ━━━
const RAKUTEN_SEARCH = (code: string) =>
  `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(code)}/?sid=418128`;
const YAHOO_SEARCH = (code: string) =>
  `https://store.shopping.yahoo.co.jp/nagapo/search.html?p=${encodeURIComponent(code)}`;

/**
 * 商品コードと店舗名から最適な商品ページURLを返す。
 * メルカリは商品名でメルカリ内検索URLを動的生成（ハードコード不要）。
 */
export function getProductUrl(code: string, shopName: string, productName?: string): string | null {
  const links = PRODUCT_LINKS[code];

  // メルカリ判定: 店舗名 or 商品コードの mercari- プレフィックス
  if (shopName.includes("メルカリ") || code.startsWith("mercari-")) {
    if (productName) {
      const query = productName.substring(0, 40).trim();
      return `https://jp.mercari.com/search?keyword=${encodeURIComponent(query)}`;
    }
    return MERCARI_SHOP_URL;
  }

  if (shopName.includes("Amazon")) {
    return links?.amazon ?? null;
  }

  if (shopName.includes("楽天")) {
    return links?.rakuten ?? RAKUTEN_SEARCH(code);
  }

  return links?.yahoo ?? YAHOO_SEARCH(code);
}

/**
 * ピッキング用: 店舗が不明な場合のURL生成
 * mercari- コードは商品名でメルカリ検索、それ以外はYahoo優先
 */
export function getProductUrlForPicking(code: string, productName?: string): string {
  if (code.startsWith("mercari-") && productName) {
    const query = productName.substring(0, 40).trim();
    return `https://jp.mercari.com/search?keyword=${encodeURIComponent(query)}`;
  }
  const links = PRODUCT_LINKS[code];
  return links?.yahoo ?? links?.rakuten ?? YAHOO_SEARCH(code);
}