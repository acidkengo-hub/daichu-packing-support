// src/parsers.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DAICHU 梱包作業支援ツール v2 — 注文詳細CSVパーサー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import * as Papa from "papaparse";

// ━━━ 型定義 ━━━

export type PickingItem = {
  id: number;
  code: string;
  name: string;
  attr1: string;
  attr2: string;
  qty: number;
  setSize: number; // 0=通常商品, 2=2枚セット等
};

export type Product = {
  code: string;
  name: string;
  attr1: string;
  attr2: string;
  qty: number;
  setSize: number; // 0=通常商品, 2=2枚セット等
};

export type Order = {
  mgmtNo: string;
  shopName: string;
  recipientName: string;
  recipientPostal: string;
  recipientAddr: string;
  recipientTel: string;
  ordererName: string;
  deliveryDate: string;
  okihai: string;
  products: Product[];
  totalItems: number;
};

export type CarrierData = {
  orders: Order[];
  pickingItems: PickingItem[];
  totalPickingQty: number;
};

export type ParsedData = {
  sagawa: CarrierData;
  yamato: CarrierData;
};

// ━━━ 定数 ━━━

const MERGE_CODES: Record<string, [string, boolean]> = {
  "pet-019": ["pet-010", true],
};

const SET_PATTERN = /(\d+)set$/i;

// ━━━ メインパーサー ━━━

export async function parseOrderCSV(file: File): Promise<ParsedData> {
  const buffer = await file.arrayBuffer();
  const decoder = new TextDecoder("shift_jis");
  const text = decoder.decode(buffer);

  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    console.warn("[CSV] パースエラー:", result.errors);
  }

  if (result.data.length === 0) {
    throw new Error("CSVにデータがありません");
  }

  // --- Step 1: 管理番号でグルーピング ---
  const orderMap = new Map<string, Record<string, string>[]>();
  for (const row of result.data) {
    const mgmtNo = (row["管理番号"] || "").trim();
    if (!mgmtNo) continue;
    if (!orderMap.has(mgmtNo)) orderMap.set(mgmtNo, []);
    orderMap.get(mgmtNo)!.push(row);
  }

  // --- Step 2: 配送便で分割し、注文データを構築 ---
  const sagawaOrders: Order[] = [];
  const yamatoOrders: Order[] = [];

  for (const [mgmtNo, rows] of orderMap) {
    const r0 = rows[0];
    const carrierName = r0["配送便名"] || "";

    const isSagawa = carrierName.includes("佐川") || carrierName.includes("飛脚");
    const isYamato = carrierName.includes("ネコポス");

    if (!isSagawa && !isYamato) {
      console.warn(`[CSV] 不明な配送便: "${carrierName}" (管理番号:${mgmtNo})`);
      continue;
    }

    const bikou = (r0["配送備考"] || "").trim();
    const okihai = bikou.includes("置き配") ? bikou : "";
    const deliveryDate = (r0["配送希望日"] || "").trim();

    const addr = [
      r0["届け先都道府県"] || "",
      r0["届け先住所１"] || "",
      r0["届け先住所２"] || "",
    ].join("");

    const products: Product[] = [];
    for (const row of rows) {
      let code = (row["商品コード"] || "").trim();
      const name = (row["商品名"] || "").trim();
      let attr1 = (row["属性１名"] || "").trim();
      let attr2 = (row["属性２名"] || "").trim();
      const attr2Code = (row["属性２コード"] || "").trim();
      let qty = parseInt(row["数量"] || "0", 10) || 0;

      if (qty === 0) continue;

      // セット販売の数量倍化
      let setSize = 0;
      const setMatch = SET_PATTERN.exec(attr2Code);
      if (setMatch) {
        setSize = parseInt(setMatch[1], 10);
        qty *= setSize;
        // 属性名から "N枚セット" を除去
        attr2 = attr2.replace(/\d+枚セット$/, "").trim();
      }

      // コード統合
      if (code in MERGE_CODES) {
        const [canonical, swapAttrs] = MERGE_CODES[code];
        code = canonical;
        if (swapAttrs) {
          [attr1, attr2] = [attr2, attr1];
        }
      }

      products.push({ code, name, attr1, attr2, qty, setSize });
    }

    if (products.length === 0) continue;

    const totalItems = products.reduce((sum, p) => sum + p.qty, 0);

    const order: Order = {
      mgmtNo,
      shopName: (r0["店舗名"] || "").trim(),
      recipientName: (r0["届け先氏名"] || "").trim(),
      recipientPostal: (r0["届け先郵便番号"] || "").trim(),
      recipientAddr: addr,
      recipientTel: (r0["届け先ＴＥＬ"] || "").trim(),
      ordererName: (r0["注文者氏名"] || "").trim(),
      deliveryDate,
      okihai,
      products,
      totalItems,
    };

    if (isSagawa) {
      sagawaOrders.push(order);
    } else {
      yamatoOrders.push(order);
    }
  }

  // --- Step 3: ピッキングデータ集約 ---

  /** サイズ文字列からソート用の数値を抽出 */
  function extractSizeOrder(attr: string): number {
    const s = attr.trim().toUpperCase();
    // 標準サイズ表記
    if (s.startsWith("XS")) return 10;
    if (/^S([(\s]|$)/.test(s)) return 20;
    if (/^M([(\s]|$)/.test(s)) return 30;
    if (/^L([(\s]|$)/.test(s)) return 40;
    if (s.startsWith("XL")) return 50;
    if (s.startsWith("XXL") || s.startsWith("2XL")) return 60;
    if (s.startsWith("3XL")) return 70;
    if (attr.includes("フリー")) return 35;
    // 数値抽出（"23.5cm(36-37)" → 23.5, "3段" → 3）
    const numMatch = attr.match(/(\d+\.?\d*)/);
    if (numMatch) return parseFloat(numMatch[1]);
    return 999;
  }

  /** PickingItem のサイズソートキーを返す（attr1, attr2 の両方を試行） */
  function getItemSizeOrder(item: PickingItem): number {
    const o1 = extractSizeOrder(item.attr1);
    const o2 = extractSizeOrder(item.attr2);
    if (o1 < 999) return o1;
    if (o2 < 999) return o2;
    return 999;
  }

  function buildPickingItems(orders: Order[]): PickingItem[] {
    const merged = new Map<string, PickingItem>();

    for (const o of orders) {
      for (const p of o.products) {
        const key = `${p.code}|${p.attr1}|${p.attr2}`;
        const existing = merged.get(key);
        if (existing) {
          existing.qty += p.qty;
        } else {
          merged.set(key, {
            id: 0,
            code: p.code,
            name: p.name,
            attr1: p.attr1,
            attr2: p.attr2,
            qty: p.qty,
            setSize: p.setSize,
          });
        }
      }
    }

    const nameMap = new Map<string, string>();
    for (const item of merged.values()) {
      if (item.name && !nameMap.has(item.code)) {
        nameMap.set(item.code, item.name);
      }
    }
    for (const item of merged.values()) {
      if (!item.name) {
        item.name = nameMap.get(item.code) || item.code;
      }
    }

    // ソート済みリストを構築
    const items = [...merged.values()];
    items.sort((a, b) => {
      // 1. mercari- コードは最後尾
      const aM = a.code.startsWith("mercari-");
      const bM = b.code.startsWith("mercari-");
      if (aM !== bM) return aM ? 1 : -1;

      // 2. 商品コード順（同じ商品がグループ化される）
      if (a.code !== b.code) return a.code.localeCompare(b.code, "ja");

      // 3. 同一コード内はサイズ小→大
      return getItemSizeOrder(a) - getItemSizeOrder(b);
    });

    // ID採番
    for (let i = 0; i < items.length; i++) {
      items[i].id = i;
    }
    return items;
  }

  const sagawaPicking = buildPickingItems(sagawaOrders);
  const yamatoPicking = buildPickingItems(yamatoOrders);

  console.log(
    `[CSV] 解析完了: 佐川 ${sagawaOrders.length}件(${sagawaPicking.length}種), ` +
      `ヤマト ${yamatoOrders.length}件(${yamatoPicking.length}種)`
  );

  return {
    sagawa: {
      orders: sagawaOrders,
      pickingItems: sagawaPicking,
      totalPickingQty: sagawaPicking.reduce((s, i) => s + i.qty, 0),
    },
    yamato: {
      orders: yamatoOrders,
      pickingItems: yamatoPicking,
      totalPickingQty: yamatoPicking.reduce((s, i) => s + i.qty, 0),
    },
  };
}