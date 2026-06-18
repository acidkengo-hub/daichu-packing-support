// src/parsers.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DAICHU 梱包作業支援ツール — クライアントサイドパーサー
// backend/main.py からの移植（PWA版）
//
// PDF: pdfjs-dist で CIDFont 日本語テキストを抽出し、
//      Y座標グルーピングで行を構築 → pdfplumber と同等の出力を生成
// CSV: PapaParse + TextDecoder("shift_jis") で Shift_JIS デコード
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import * as Papa from "papaparse";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// ━━━ pdf.js 初期化 ━━━
// Worker: Vite が node_modules から自動バンドル（CDN不要）
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

// ━━━ 型定義 ━━━
export type PickingItem = {
  id: number;
  code: string;
  qty: number;
  name: string;
  attr1: string;
  attr2: string;
  tana: string;
};

export type Product = {
  code: string;
  name: string;
  size: string;
  color: string;
  qty: number;
};

export type Order = {
  mgmtNo: string;
  shopName: string;
  carrier: string;
  recipientName: string;
  recipientPostal: string;
  recipientAddr: string;
  recipientTel: string;
  ordererName: string;
  isDiffAddr: boolean;
  deliveryDate: string;
  okihai: string;
  products: Product[];
  totalItems: number;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PDF テキスト抽出（pdf.js → Y座標グルーピング）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// pdfplumber は内部的に pdfminer.six を使い、CMap を正しく解釈して
// 同じY座標の文字を1行として結合する処理を自動で行う。
// pdf.js でも getTextContent() でテキストアイテムを取得し、
// Y座標でグルーピングすることで同等の出力を生成できる。

/** Y座標の一致判定トレランス（ピクセル） */
const Y_TOLERANCE = 2;

/** スペース挿入判定の最小ギャップ（ピクセル） */
const SPACE_GAP = 3;

type TextItem = {
  x: number;
  text: string;
  width: number;
};

/**
 * pdf.js の getTextContent() 結果から、Y座標でグルーピングして
 * テキスト行の配列を構築する。
 * pdfplumber の extract_text() と同等の出力を生成する。
 */
function buildLines(
  content: Awaited<ReturnType<import("pdfjs-dist").PDFPageProxy["getTextContent"]>>
): string[] {
  const lineMap = new Map<number, TextItem[]>();

  for (const item of content.items) {
    // TextItem のみ処理（TextMarkedContent はスキップ）
    if (!("str" in item) || !item.str) continue;

    const y = Math.round(item.transform[5]); // Y座標（PDF座標系: 下が0）
    const x = item.transform[4]; // X座標

    // Y座標がトレランス内の既存行を探す
    let matchedY: number | null = null;
    for (const existingY of lineMap.keys()) {
      if (Math.abs(existingY - y) <= Y_TOLERANCE) {
        matchedY = existingY;
        break;
      }
    }

    const targetY = matchedY !== null ? matchedY : y;
    if (!lineMap.has(targetY)) lineMap.set(targetY, []);
    lineMap.get(targetY)!.push({
      x,
      text: item.str,
      width: item.width || 0,
    });
  }

  // Y座標降順（PDF座標系: 上の行ほどY値が大きい）でソート
  // 各行内はX座標昇順（左→右）でソート
  return [...lineMap.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, items]) => {
      items.sort((a, b) => a.x - b.x);
      let result = "";
      for (let i = 0; i < items.length; i++) {
        if (i > 0) {
          const gap = items[i].x - (items[i - 1].x + items[i - 1].width);
          result += gap > SPACE_GAP ? " " : "";
        }
        result += items[i].text;
      }
      return result;
    });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PDF パーサー（受注票）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// pdfplumber出力形式の特徴:
//   名前（フリガナ）様        ← 注文者の前の行
//   注文者 〒xxx-xxxx 住所    ← 注文者行（住所がインライン）
//   届け先 同上               ← or 届け先行
//   商品名... 10% qty price total ← 商品行（数量がインライン）

/**
 * 1ページ分のテキストから受注データを抽出する。
 * pdf.js の buildLines() で構築したテキストを受け取る。
 */
export function parseOrderPage(text: string): Order | null {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  /** keyword を含む最初の行を返す */
  function find(keyword: string): string {
    for (const l of lines) {
      if (l.includes(keyword)) return l;
    }
    return "";
  }

  /** keyword の後ろの値を返す */
  function getValue(keyword: string): string {
    const line = find(keyword);
    if (!line) return "";
    return line.split(keyword).slice(1).join(keyword).trim();
  }

  // --- 管理番号 ---
  const mgmtNo = getValue("管理番号");
  if (!mgmtNo) return null;

  // --- 店舗名 ---
  const shopName = getValue("店舗名");

  // --- 配送便 ---
  const deliveryLine = find("配送便");
  let carrier = "";
  if (deliveryLine.includes("佐川") || deliveryLine.includes("飛脚")) {
    carrier = "佐川";
  } else if (deliveryLine.includes("ネコポス")) {
    carrier = "ヤマト";
  }

  // --- 注文者・届け先 ---
  // pdfplumber形式:
  //   名前（フリガナ）様        ← 注文者の前の行
  //   注文者 〒xxx-xxxx 住所    ← 注文者行（住所がインライン）
  //   届け先 同上               ← or 届け先行
  // または:
  //   名前（フリガナ）様
  //   届け先 〒xxx-xxxx 住所
  let ordererName = "";
  let recipientName = "";
  let recipientPostal = "";
  let recipientAddr = "";
  let recipientTel = "";
  let isDiffAddr = false;

  let ordererIdx = -1;
  let recipientIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("注文者") || lines[i] === "注文者") {
      ordererIdx = i;
    }
    if (lines[i].startsWith("届け先")) {
      recipientIdx = i;
    }
  }

  // 注文者名: 「様」を含む行で、注文者行の直前にあるもの
  if (ordererIdx > 0) {
    for (let j = ordererIdx - 1; j >= Math.max(ordererIdx - 3, 0); j--) {
      if (lines[j].includes("様")) {
        ordererName = lines[j]
          .replace(/（[^）]*）/g, "")
          .replace("様", "")
          .trim();
        break;
      }
    }
  }

  /**
   * '〒xxx-xxxx 住所...' から郵便番号と住所を抽出
   */
  function extractAddr(line: string): [string, string] {
    const m = line.match(/〒(\d{3}-?\d{4})\s*(.*)/);
    return m ? [m[1], m[2]] : ["", ""];
  }

  /** start_idx以降で最初の (TEL) 行を探す */
  function findTelAfter(startIdx: number): string {
    for (let j = startIdx; j < Math.min(startIdx + 5, lines.length); j++) {
      if (lines[j].includes("(TEL)")) {
        return lines[j].split("(TEL)").pop()?.trim() || "";
      }
    }
    return "";
  }

  if (recipientIdx >= 0) {
    const rLine = lines[recipientIdx];

    if (rLine.includes("同上")) {
      // 届け先 = 注文者と同じ
      // 注文者行から住所を抽出
      if (ordererIdx >= 0) {
        const [postal, addr] = extractAddr(lines[ordererIdx]);
        recipientPostal = postal;
        // "注文者" という文字列を住所から除去
        recipientAddr = addr.replace(/^注文者\s*/, "").trim();
        recipientTel = findTelAfter(ordererIdx + 1);
      }
      recipientName = ordererName;
    } else {
      // 届け先が異なる
      isDiffAddr = true;
      // 注文者が (未登録) なら実質的には同一とみなす（メルカリ/Amazon店）
      if (ordererName.includes("未登録")) {
        isDiffAddr = false;
      }

      // 届け先名: 届け先行の直前の「様」行
      for (
        let j = recipientIdx - 1;
        j >= Math.max(recipientIdx - 3, 0);
        j--
      ) {
        if (lines[j].includes("様")) {
          recipientName = lines[j]
            .replace(/（[^）]*）/g, "")
            .replace("様", "")
            .trim();
          break;
        }
      }

      // 届け先住所: "届け先 〒xxx-xxxx 住所"
      const [postal, addr] = extractAddr(rLine);
      recipientPostal = postal;
      recipientAddr = addr;
      recipientTel = findTelAfter(recipientIdx + 1);
    }
  }

  // --- 配送希望日 ---
  let deliveryDate = "";
  const ddLine = find("配送希望日");
  const ddMatch = ddLine.match(/(\d{4}-\d{2}-\d{2})/);
  if (ddMatch) {
    deliveryDate = ddMatch[1];
  }

  // --- 置き配 ---
  let okihai = "";
  const okiLine = find("置き配");
  if (okiLine) {
    const okiVal = okiLine.split("置き配").slice(1).join("置き配").trim();
    if (!okiVal.includes("対面受取") && !okiVal.includes("（0）")) {
      // ヤフショ形式: "受け取り方法:玄関ドア前（1）"
      const m = okiVal.match(/受け取り方法[:：](.+?)(?:（|$)/);
      // 楽天形式: "玄関前" / "宅配ボックス" 等
      okihai = m ? m[1].trim() : okiVal;
    }
  }

  // --- 商品 ---
  const products: Product[] = [];

  // 商品セクションの開始行を探す
  let prodStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (
      lines[i].includes("商品") &&
      lines[i].includes("税率") &&
      lines[i].includes("数量")
    ) {
      prodStart = i + 1;
      break;
    }
  }

  if (prodStart >= 0) {
    let j = prodStart;
    while (j < lines.length) {
      const line = lines[j];

      // 商品コードで始まる行: (code) 商品名...
      const codeMatch = line.match(/^\(([^)]+)\)\s+(.+)/);
      if (codeMatch) {
        const code = codeMatch[1];
        let nameRaw = codeMatch[2];
        let qty = 1;

        // pdfplumber形式: 商品名の末尾に "10% 数量 単価 金額" がインライン
        const inlineMatch = nameRaw.match(
          /\s+(\d+)%\s+(\d+)\s+[\d,]+\s+[\d,]+$/
        );
        if (inlineMatch) {
          nameRaw = nameRaw.substring(0, inlineMatch.index);
          qty = parseInt(inlineMatch[2], 10);
        }

        let k = j + 1;
        while (k < lines.length) {
          const sl = lines[k];
          // 次の商品コード、属性行（「：」付き）、小計行で打ち切り
          // 【修正】"サイズ" ではなく "サイズ：" で判定する。
          // 理由: 商品名の折り返しで "サイズ かぶる シンプル..." のように
          // "サイズ" で始まる行が出現するが、これは属性行ではなく名前の続き。
          // 属性行は必ず "サイズ：(code) 値" の形式なので、全角コロンで区別する。
          if (
            /^\(/.test(sl) ||
            /^(サイズ|カラー)[：:]/.test(sl) ||
            sl.startsWith("小計") ||
            sl.includes("対象（税込") ||
            /^\d+%\s+\d+/.test(sl)
          ) {
            break;
          }
          // (税込) や金額行はスキップ
          if (sl.includes("(税込)") || /^[\d,]+\s*$/.test(sl)) {
            k++;
            continue;
          }
          k++;
        }

        // フォールバック: 独立した "10% qty ..." 行
        if (!inlineMatch && k < lines.length) {
          const qtyMatch = lines[k].match(/^(\d+)%\s+(\d+)/);
          if (qtyMatch) {
            qty = parseInt(qtyMatch[2], 10);
            k++;
          }
        }

        // 金額行スキップ
        while (
          k < lines.length &&
          (lines[k].includes("税込") || /^[\d,]+\s*$/.test(lines[k]))
        ) {
          k++;
        }

        // 属性（サイズ・カラー）を抽出
        let size = "";
        let color = "";
        while (k < lines.length) {
          const sl = lines[k];
          if (sl.startsWith("サイズ：") || sl.startsWith("サイズ:")) {
            const sm = sl.match(/[：:]\(([^)]*)\)\s*(.*)/);
            size = sm
              ? sm[2] || sm[1]
              : sl
                  .split(/[：:]/g)
                  .pop()
                  ?.trim() || "";
          } else if (
            sl.startsWith("カラー：") ||
            sl.startsWith("カラー:")
          ) {
            const cm = sl.match(/[：:]\(([^)]*)\)\s*(.*)/);
            color = cm
              ? cm[2] || cm[1]
              : sl
                  .split(/[：:]/g)
                  .pop()
                  ?.trim() || "";
          } else if (
            !sl.startsWith("衛生品") &&
            !sl.startsWith("選択サイズ") &&
            !sl.startsWith("サイズ（") &&
            !sl.startsWith("種類")
          ) {
            break;
          }
          k++;
        }

        const shortName = nameRaw.replace(/\s+/g, " ").trim().substring(0, 40);
        products.push({ code, name: shortName, size, color, qty });
        j = k;
      } else if (line.startsWith("小計") || line.includes("対象（税込")) {
        break;
      } else {
        j++;
      }
    }
  }

  if (products.length === 0) return null;

  const totalItems = products.reduce((sum, p) => sum + p.qty, 0);

  return {
    mgmtNo,
    shopName,
    carrier,
    recipientName,
    recipientPostal,
    recipientAddr,
    recipientTel,
    ordererName,
    isDiffAddr,
    deliveryDate,
    okihai,
    products,
    totalItems,
  };
}

/**
 * 受注票PDF（CROSS MALL出力）を全ページ解析し、受注データのリストを返す。
 *
 * pdf.js で CIDFont 日本語テキストを抽出し、Y座標グルーピングで行を構築する。
 * CMap ファイルは public/cmaps/ に配置済み。
 */
export async function parseOrderFile(file: File): Promise<Order[]> {
  const buffer = await file.arrayBuffer();
  const orders: Order[] = [];

  try {
    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      cMapUrl: "/cmaps/",
      cMapPacked: true,
    }).promise;

    console.log(`[PDF] ${doc.numPages} ページ検出`);

    for (let i = 1; i <= doc.numPages; i++) {
      try {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const lineTexts = buildLines(content);
        const text = lineTexts.join("\n");
        const order = parseOrderPage(text);

        if (order) {
          orders.push(order);
        } else {
          console.warn(`[PDF] ページ ${i}: パース失敗（スキップ）`);
        }
      } catch (pageErr) {
        console.error(
          `[PDF] ページ ${i} の処理エラー:`,
          pageErr instanceof Error ? pageErr.message : pageErr
        );
      }
    }

// 修正後（doc.destroy() を削除）
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[PDF] 読み込みエラー: ${msg}`);
    throw new Error(`受注票の読み込みに失敗しました: ${msg}`);
  }

  // 集計情報をログ出力
  const diffCount = orders.filter((o) => o.isDiffAddr).length;
  const okiCount = orders.filter((o) => o.okihai).length;
  const dateCount = orders.filter((o) => o.deliveryDate).length;
  console.log(
    `[PDF] 解析完了: ${orders.length}件 ` +
      `(届け先相違:${diffCount}, 置き配:${okiCount}, 配送希望日:${dateCount})`
  );

  return orders;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CSV パーサー（ピッキングリスト）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 商品コード統合マップ
// 同一商品が店舗ごとに異なるコードで登録されているケースを正規化する。
// key: 変換元コード → value: [正規コード, 属性の入れ替えが必要か]
// pet-019(楽天) は pet-010(ヤフショ) と同一商品だが、属性1名と属性2名の順序が逆。
const MERGE_CODES: Record<string, [string, boolean]> = {
  "pet-019": ["pet-010", true], // true = attr1↔attr2 を入れ替える
};

// セット販売パターン
// 属性コード2に "2set" 等が含まれる場合、数量を倍数にする。
const SET_PATTERN = /(\d+)set$/i;

/**
 * セット表記を除去してサイズ名を正規化。
 * 例: 'L(50×70cm)2枚セット' → 'L(50×70cm)'
 */
function normalizeSizeName(name: string): string {
  return name.replace(/\d+枚セット$/, "").trim();
}

/**
 * Shift_JIS（cp932）のCSVをパースし、統合済みピッキングデータを返す。
 *
 * 処理フロー:
 * 1. TextDecoder("shift_jis") で Shift_JIS バイナリ → UTF-8 文字列に変換
 * 2. PapaParse でCSVパース
 * 3. 商品コード統合（MERGE_CODES マップ）
 * 4. セット販売の数量倍化（SET_PATTERN）
 * 5. 同一コード+同一属性の行をマージ
 * 6. 名前が空の統合アイテムに、同コードの名前を補完
 */
export async function parsePickingCSV(file: File): Promise<PickingItem[]> {
  const buffer = await file.arrayBuffer();

  // Shift_JIS → UTF-8 デコード
  const decoder = new TextDecoder("shift_jis");
  const text = decoder.decode(buffer);

  // PapaParse でCSVパース（ヘッダー行あり）
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    console.warn("[CSV] パースエラー:", result.errors);
  }

  // Step 1: 行ごとにパースし、正規化する
  type RawItem = {
    code: string;
    qty: number;
    name: string;
    attr1: string;
    attr2: string;
    tana: string;
  };

  const rawItems: RawItem[] = [];

  for (const row of result.data) {
    let qty = Math.floor(Number(row["数量"] || "0") || 0);
    if (qty === 0) continue;

    let code = (row["商品コード"] || "").trim();
    let attr1Name = (row["属性１名"] || "").trim();
    let attr2Name = (row["属性２名"] || "").trim();
    const attr2Code = (row["属性コード2"] || "").trim();
    let name = (row["商品名称"] || "").trim();
    const tana = (row["棚番"] || "").trim();

    // コード統合: pet-019 → pet-010 等
    if (code in MERGE_CODES) {
      const [canonical, swapAttrs] = MERGE_CODES[code];
      code = canonical;
      if (swapAttrs) {
        [attr1Name, attr2Name] = [attr2Name, attr1Name];
      }
      name = "";
    }

    // セット販売の数量倍化
    const setMatch = SET_PATTERN.exec(attr2Code);
    if (setMatch) {
      const multiplier = parseInt(setMatch[1], 10);
      qty *= multiplier;
      attr2Name = normalizeSizeName(attr2Name);
    }

    rawItems.push({
      code,
      qty,
      name,
      attr1: attr1Name,
      attr2: attr2Name,
      tana,
    });
  }

  // Step 2: 同一コード+同一属性の行をマージ
  const merged = new Map<string, RawItem>();
  for (const item of rawItems) {
    const key = `${item.code}|${item.attr1}|${item.attr2}`;
    const existing = merged.get(key);
    if (existing) {
      existing.qty += item.qty;
    } else {
      merged.set(key, { ...item });
    }
  }

  // 名前が空の統合アイテムに、同コードの名前を補完
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

  // Step 3: IDを振って返す
  const items: PickingItem[] = [];
  let id = 0;
  for (const item of merged.values()) {
    items.push({ ...item, id: id++ });
  }

  return items;
}