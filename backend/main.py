# backend/main.py
"""
DAICHU 梱包作業支援ツール — バックエンド
FastAPI + WebSocket + pdfplumber
"""
import csv
import io
import json
import os
import re
from typing import List

import pdfplumber
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

app = FastAPI(title="DAICHU Packing Support")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# セッションストア（インメモリ）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
session = {
    "carrier": "",
    "picking": [],
    "packing": [],
}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# WebSocket 接続マネージャー
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class ConnectionManager:
    def __init__(self):
        self.connections: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.connections.append(ws)
        print(f"[WS] 接続: 現在 {len(self.connections)} 台")

    def disconnect(self, ws: WebSocket):
        if ws in self.connections:
            self.connections.remove(ws)
        print(f"[WS] 切断: 現在 {len(self.connections)} 台")

    async def broadcast(self, message: dict):
        data = json.dumps(message, ensure_ascii=False)
        dead = []
        for ws in self.connections:
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            if ws in self.connections:
                self.connections.remove(ws)


manager = ConnectionManager()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CSV パーサー（商品統合ロジック付き）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# 商品コード統合マップ
# 同一商品が店舗ごとに異なるコードで登録されているケースを正規化する。
# key: 変換元コード → value: (正規コード, 属性の入れ替えが必要か)
# pet-019(楽天) は pet-010(ヤフショ) と同一商品だが、属性1名と属性2名の順序が逆。
MERGE_CODES: dict[str, tuple[str, bool]] = {
    "pet-019": ("pet-010", True),   # True = attr1↔attr2 を入れ替える
}

# セット販売パターン
# 属性コード2に "2set" 等が含まれる場合、数量を倍数にする。
# 例: "l-2set" → サイズ=L, 実質数量=元の数量×2
import re as _re
SET_PATTERN = _re.compile(r"(\d+)set$", _re.IGNORECASE)


def _normalize_size_name(name: str) -> str:
    """セット表記を除去してサイズ名を正規化。
    例: 'L(50×70cm)2枚セット' → 'L(50×70cm)'
    """
    return _re.sub(r"\d+枚セット$", "", name).strip()


def parse_picking_csv(raw_bytes: bytes) -> list[dict]:
    """Shift_JIS（cp932）のCSVをパースし、統合済みピッキングデータを返す"""
    text = raw_bytes.decode("cp932")
    reader = csv.DictReader(io.StringIO(text))

    # Step 1: 行ごとにパースし、正規化する
    raw_items = []
    for row in reader:
        qty = int(float(row.get("数量", "0") or "0"))
        if qty == 0:
            continue

        code = row.get("商品コード", "").strip()
        attr1_name = row.get("属性１名", "").strip()
        attr2_name = row.get("属性２名", "").strip()
        attr2_code = row.get("属性コード2", "").strip()
        name = row.get("商品名称", "").strip()
        tana = row.get("棚番", "").strip()

        # コード統合: pet-019 → pet-010 等
        if code in MERGE_CODES:
            canonical, swap_attrs = MERGE_CODES[code]
            code = canonical
            if swap_attrs:
                attr1_name, attr2_name = attr2_name, attr1_name
            # 統合後の商品名はヤフショ側の名称を使う（後でマージ時に上書き）
            name = ""  # 空にしておき、マージ時に既存の名前を使う

        # セット販売の数量倍化
        # 属性コード2 に "2set" が含まれる場合: qty × 2
        # 属性名2 から "2枚セット" を除去してサイズ名を正規化
        set_match = SET_PATTERN.search(attr2_code)
        if set_match:
            multiplier = int(set_match.group(1))
            qty *= multiplier
            attr2_name = _normalize_size_name(attr2_name)

        raw_items.append({
            "code": code,
            "qty": qty,
            "name": name,
            "attr1": attr1_name,
            "attr2": attr2_name,
            "tana": tana,
        })

    # Step 2: 同一コード+同一属性の行をマージ
    # キー: (商品コード, 属性1名, 属性2名)
    merged: dict[tuple, dict] = {}
    for item in raw_items:
        key = (item["code"], item["attr1"], item["attr2"])
        if key in merged:
            merged[key]["qty"] += item["qty"]
        else:
            merged[key] = dict(item)

    # 名前が空の統合アイテムに、同コードの名前を補完
    name_map: dict[str, str] = {}
    for item in merged.values():
        if item["name"] and item["code"] not in name_map:
            name_map[item["code"]] = item["name"]
    for item in merged.values():
        if not item["name"]:
            item["name"] = name_map.get(item["code"], item["code"])

    # Step 3: IDを振って返す
    result = []
    for i, item in enumerate(merged.values()):
        item["id"] = i
        result.append(item)

    return result


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PDF パーサー（受注票）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 【深掘り②】pdfplumber vs pypdf:
#   pypdf は PDF の内部テキストストリームを単純にデコードするが、
#   CIDFont（Adobe-Japan1 等の CJK フォント）の CMap マッピングに対応していない。
#   そのため日本語が文字化けする。
#   pdfplumber は内部的に pdfminer.six を使い、CMap を正しく解釈して
#   文字コードからUnicode文字への変換を行うため、日本語PDFでも正確に抽出できる。
#   さらに pdfplumber はテキストの座標情報を使い、
#   同じ Y 座標の文字を1行として結合する処理を自動で行ってくれる。

def parse_order_page(text: str) -> dict | None:
    """1ページ分のテキストから受注データを抽出する"""
    lines = [l.strip() for l in text.split("\n") if l.strip()]

    def find(keyword: str) -> str:
        """keywordを含む最初の行を返す"""
        for l in lines:
            if keyword in l:
                return l
        return ""

    def get_value(keyword: str) -> str:
        """keyword の後ろの値を返す"""
        line = find(keyword)
        if not line:
            return ""
        return line.split(keyword, 1)[-1].strip()

    # --- 管理番号 ---
    mgmt_no = get_value("管理番号")
    if not mgmt_no:
        return None

    # --- 店舗名 ---
    shop_name = get_value("店舗名")

    # --- 配送便 ---
    delivery_line = find("配送便")
    carrier = ""
    if "佐川" in delivery_line or "飛脚" in delivery_line:
        carrier = "佐川"
    elif "ネコポス" in delivery_line:
        carrier = "ヤマト"

    # --- 注文者・届け先 ---
    # pdfplumber形式:
    #   名前（フリガナ）様        ← 注文者の前の行
    #   注文者 〒xxx-xxxx 住所    ← 注文者行（住所がインライン）
    #   届け先 同上               ← or 届け先行
    # または:
    #   名前（フリガナ）様
    #   届け先 〒xxx-xxxx 住所
    orderer_name = ""
    recipient_name = ""
    recipient_postal = ""
    recipient_addr = ""
    recipient_tel = ""
    is_diff_addr = False

    orderer_idx = -1
    recipient_idx = -1
    for i, l in enumerate(lines):
        if l.startswith("注文者") or l == "注文者":
            orderer_idx = i
        if l.startswith("届け先"):
            recipient_idx = i

    # 注文者名: 「様」を含む行で、注文者行の直前にあるもの
    if orderer_idx > 0:
        for j in range(orderer_idx - 1, max(orderer_idx - 3, -1), -1):
            if "様" in lines[j]:
                orderer_name = re.sub(r"（[^）]*）", "", lines[j]).replace("様", "").strip()
                break

    def extract_addr_from_line(line: str) -> tuple[str, str]:
        """'〒xxx-xxxx 住所...' から郵便番号と住所を抽出"""
        m = re.search(r"〒(\d{3}-?\d{4})\s*(.*)", line)
        if m:
            return m.group(1), m.group(2)
        return "", ""

    def find_tel_after(start_idx: int) -> str:
        """start_idx以降で最初の (TEL) 行を探す"""
        for j in range(start_idx, min(start_idx + 5, len(lines))):
            if "(TEL)" in lines[j]:
                return lines[j].split("(TEL)")[-1].strip()
        return ""

    if recipient_idx >= 0:
        r_line = lines[recipient_idx]

        if "同上" in r_line:
            # 届け先 = 注文者と同じ
            # 注文者行から住所を抽出
            if orderer_idx >= 0:
                o_line = lines[orderer_idx]
                # "注文者 〒xxx-xxxx 住所" のパターン
                postal, addr = extract_addr_from_line(o_line)
                if postal:
                    recipient_postal = postal
                    recipient_addr = addr
                    # "注文者" という文字列を住所から除去
                    recipient_addr = re.sub(r"^注文者\s*", "", recipient_addr).strip()
                recipient_tel = find_tel_after(orderer_idx + 1)
            recipient_name = orderer_name

        else:
            # 届け先が異なる
            is_diff_addr = True
            # 注文者が (未登録) なら実質的には同一とみなす
            if "未登録" in orderer_name:
                is_diff_addr = False

            # 届け先名: 届け先行の直前の「様」行
            for j in range(recipient_idx - 1, max(recipient_idx - 3, -1), -1):
                if "様" in lines[j]:
                    recipient_name = re.sub(r"（[^）]*）", "", lines[j]).replace("様", "").strip()
                    break

            # 届け先住所: "届け先 〒xxx-xxxx 住所"
            postal, addr = extract_addr_from_line(r_line)
            if postal:
                recipient_postal = postal
                recipient_addr = addr
            recipient_tel = find_tel_after(recipient_idx + 1)

    # --- 配送希望日 ---
    delivery_date = ""
    dd_line = find("配送希望日")
    dd_match = re.search(r"(\d{4}-\d{2}-\d{2})", dd_line)
    if dd_match:
        delivery_date = dd_match.group(1)

    # --- 置き配 ---
    okihai = ""
    oki_line = find("置き配")
    if oki_line:
        oki_val = oki_line.split("置き配", 1)[-1].strip()
        if "対面受取" not in oki_val and "（0）" not in oki_val:
            # ヤフショ形式: "受け取り方法:玄関ドア前（1）"
            m = re.search(r"受け取り方法[:：](.+?)(?:（|$)", oki_val)
            okihai = m.group(1).strip() if m else oki_val

    # --- 商品 ---
    products = []
    # 商品セクションの開始行を探す
    prod_start = -1
    for i, l in enumerate(lines):
        if "商品" in l and "税率" in l and "数量" in l:
            prod_start = i + 1
            break

    if prod_start >= 0:
        j = prod_start
        while j < len(lines):
            line = lines[j]

            # 商品コードで始まる行: (code) 商品名...
            code_match = re.match(r"^\(([^)]+)\)\s+(.+)", line)
            if code_match:
                code = code_match.group(1)
                name_raw = code_match.group(2)
                qty = 1

                # pdfplumber形式: 商品名の末尾に "10% 数量 単価 金額" がインライン
                inline = re.search(r"\s+(\d+)%\s+(\d+)\s+[\d,]+\s+[\d,]+$", name_raw)
                if inline:
                    name_raw = name_raw[:inline.start()]
                    qty = int(inline.group(2))

                k = j + 1
                while k < len(lines):
                    sl = lines[k]
                    # 次の商品コード、属性行（「：」付き）、小計行で打ち切り
                    # 【修正】"サイズ" ではなく "サイズ：" で判定する。
                    # 理由: 商品名の折り返しで "サイズ かぶる シンプル..." のように
                    # "サイズ" で始まる行が出現するが、これは属性行ではなく名前の続き。
                    # 属性行は必ず "サイズ：(code) 値" の形式なので、全角コロンで区別する。
                    if (re.match(r"^\(", sl) or
                        re.match(r"^(サイズ|カラー)[：:]", sl) or
                        sl.startswith("小計") or "対象（税込" in sl or
                        re.match(r"^\d+%\s+\d+", sl)):
                        break
                    # (税込) や金額行はスキップ
                    if "(税込)" in sl or re.match(r"^[\d,]+\s*$", sl):
                        k += 1
                        continue
                    k += 1

                # ZIP形式のフォールバック: 独立した "10% qty ..." 行
                if not inline and k < len(lines):
                    qty_match = re.match(r"^(\d+)%\s+(\d+)", lines[k])
                    if qty_match:
                        qty = int(qty_match.group(2))
                        k += 1

                # 金額行スキップ
                while k < len(lines) and ("税込" in lines[k] or re.match(r"^[\d,]+\s*$", lines[k])):
                    k += 1

                # 属性（サイズ・カラー）を抽出
                size = ""
                color = ""
                while k < len(lines):
                    sl = lines[k]
                    if sl.startswith("サイズ：") or sl.startswith("サイズ:"):
                        sm = re.search(r"[：:]\(([^)]*)\)\s*(.*)", sl)
                        size = (sm.group(2) or sm.group(1)) if sm else sl.split("：")[-1].split(":")[-1].strip()
                    elif sl.startswith("カラー：") or sl.startswith("カラー:"):
                        cm = re.search(r"[：:]\(([^)]*)\)\s*(.*)", sl)
                        color = (cm.group(2) or cm.group(1)) if cm else sl.split("：")[-1].split(":")[-1].strip()
                    elif (not sl.startswith("衛生品") and
                          not sl.startswith("選択サイズ") and
                          not sl.startswith("サイズ（") and
                          not sl.startswith("種類")):
                        break
                    k += 1

                short_name = re.sub(r"\s+", " ", name_raw).strip()[:40]
                products.append({
                    "code": code,
                    "name": short_name,
                    "size": size,
                    "color": color,
                    "qty": qty,
                })
                j = k

            elif line.startswith("小計") or "対象（税込" in line:
                break
            else:
                j += 1

    if not products:
        return None

    total_items = sum(p["qty"] for p in products)

    return {
        "mgmtNo": mgmt_no,
        "shopName": shop_name,
        "carrier": carrier,
        "recipientName": recipient_name,
        "recipientPostal": recipient_postal,
        "recipientAddr": recipient_addr,
        "recipientTel": recipient_tel,
        "ordererName": orderer_name,
        "isDiffAddr": is_diff_addr,
        "deliveryDate": delivery_date,
        "okihai": okihai,
        "products": products,
        "totalItems": total_items,
    }


def parse_order_pdf(raw_bytes: bytes) -> list[dict]:
    """受注票PDFを全ページ解析し、受注データのリストを返す"""
    orders = []
    try:
        with pdfplumber.open(io.BytesIO(raw_bytes)) as pdf:
            print(f"[PDF] {len(pdf.pages)} ページ検出")
            for i, page in enumerate(pdf.pages):
                text = page.extract_text()
                if not text:
                    continue
                order = parse_order_page(text)
                if order:
                    orders.append(order)
                else:
                    print(f"[PDF] ページ {i+1}: パース失敗（スキップ）")
    except Exception as e:
        print(f"[PDF] 読み込みエラー: {e}")
        raise
    return orders


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# API エンドポイント
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
@app.get("/api/health")
def health_check():
    return {"status": "ok"}


@app.post("/api/upload/csv")
async def upload_csv(file: UploadFile, carrier: str = ""):
    try:
        raw = await file.read()
        items = parse_picking_csv(raw)
        if not items:
            return {"success": False, "error": "CSVにデータがありません"}
        session["carrier"] = carrier
        session["picking"] = items
        await manager.broadcast({
            "type": "picking_loaded",
            "carrier": carrier,
            "items": items,
            "totalQty": sum(item["qty"] for item in items),
        })
        return {
            "success": True,
            "count": len(items),
            "totalQty": sum(item["qty"] for item in items),
        }
    except UnicodeDecodeError as e:
        return {"success": False, "error": f"エンコーディングエラー: {e}"}
    except Exception as e:
        return {"success": False, "error": f"解析エラー: {e}"}


@app.post("/api/upload/pdf")
async def upload_pdf(file: UploadFile, carrier: str = ""):
    """受注票PDFをアップロードし、パース結果をセッションに保存 → WebSocket配信"""
    try:
        raw = await file.read()
        orders = parse_order_pdf(raw)
        if not orders:
            return {"success": False, "error": "受注データが見つかりません"}

        session["carrier"] = carrier
        session["packing"] = orders

        await manager.broadcast({
            "type": "packing_loaded",
            "carrier": carrier,
            "orders": orders,
        })

        # 集計情報をログ出力
        diff_count = sum(1 for o in orders if o["isDiffAddr"])
        oki_count = sum(1 for o in orders if o["okihai"])
        date_count = sum(1 for o in orders if o["deliveryDate"])
        print(f"[PDF] 解析完了: {len(orders)}件 "
              f"(届け先相違:{diff_count}, 置き配:{oki_count}, 配送希望日:{date_count})")

        return {
            "success": True,
            "count": len(orders),
            "totalItems": sum(o["totalItems"] for o in orders),
        }
    except Exception as e:
        return {"success": False, "error": f"PDF解析エラー: {e}"}


@app.get("/api/session")
def get_session():
    return {
        "carrier": session["carrier"],
        "picking": session["picking"],
        "packing": session["packing"],
        "totalPickingQty": sum(item["qty"] for item in session["picking"]),
    }


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)