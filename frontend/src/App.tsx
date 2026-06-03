// src/App.tsx
import { useState, useEffect, useCallback, useRef } from "react";

// ━━━ 型定義 ━━━
type PickingItem = {
  id: number;
  code: string;
  qty: number;
  name: string;
  attr1: string;
  attr2: string;
  tana: string;
};

type Product = {
  code: string;
  name: string;
  size: string;
  color: string;
  qty: number;
};

type Order = {
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

type Phase = "home" | "picking" | "pickingSummary" | "packing" | "packingSummary";
type Carrier = "" | "sagawa" | "yamato";

// ━━━ SVGアイコン ━━━
const Ic = {
  truck: (s = 24, c = "currentColor") => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 3h15v13H1z" /><path d="M16 8h4l3 3v5h-7V8z" />
      <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  ),
  cat: (s = 24, c = "currentColor") => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5c-1.5-2.5-5-3-6-1s0 4 1 5c-1.5 1-2 3-2 5 0 3 2.5 5 7 5s7-2 7-5c0-2-.5-4-2-5 1-1 2-3 1-5s-4.5-1.5-6 1z" />
      <path d="M10 14h.01M14 14h.01M10 17c.5.5 1.5 1 2 1s1.5-.5 2-1" />
    </svg>
  ),
  pkg: (s = 24, c = "currentColor") => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" />
    </svg>
  ),
  clip: (s = 24, c = "currentColor") => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" /><path d="M9 14l2 2 4-4" />
    </svg>
  ),
  up: (s = 24, c = "currentColor") => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
    </svg>
  ),
  chk: (s = 24, c = "currentColor") => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ),
  chkC: (s = 24, c = "currentColor") => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" />
    </svg>
  ),
  sq: (s = 24, c = "currentColor") => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  ),
  aL: (s = 24, c = "currentColor") => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  ),
  aR: (s = 24, c = "currentColor") => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  ),
  warn: (s = 24, c = "currentColor") => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  pin: (s = 24, c = "currentColor") => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  ),
  cal: (s = 24, c = "currentColor") => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  file: (s = 24, c = "currentColor") => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  trophy: (s = 24, c = "currentColor") => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18" />
      <path d="M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22h10c0-2-.85-3.25-2.03-3.79A1.07 1.07 0 0114 17v-2.34" />
      <path d="M18 2H6v7a6 6 0 1012 0V2z" />
    </svg>
  ),
};

// ━━━ 共通スタイル定数 ━━━
const S = {
  green: "var(--green)",
  black: "var(--black)",
  white: "var(--white)",
  grey: "var(--grey)",
  dim: "var(--dim)",
  s1: "var(--s1)",
  s2: "var(--s2)",
  s3: "var(--s3)",
  bd: "var(--border)",
  red: "var(--red)",
  amber: "var(--amber)",
  ease: "var(--ease)",
};

// ━━━ 小コンポーネント ━━━
function ProgressHeader({ current, total, checked, carrier, onBack }: {
  current: number; total: number; checked: number; carrier: Carrier; onBack: () => void;
}) {
  const label = carrier === "sagawa" ? "佐川急便" : "ヤマト運輸";
  return (
    <div className="flex flex-col gap-3.5 px-5 pt-4">
      <div className="flex items-center justify-between">
        <p className="font-[Roboto] font-extrabold text-[13px] tracking-[0.04em]" style={{ color: S.grey }}>
          <span className="text-[22px] tracking-[-0.5px]" style={{ color: S.white }}>{current}</span>
          {" / "}{total}
          <span className="ml-2" style={{ color: S.green }}>({checked})</span>
        </p>
        <span
          className="font-[Roboto] font-extrabold text-[11px] tracking-[0.08em] uppercase px-3.5 py-[5px] rounded-full"
          style={{ background: carrier === "sagawa" ? S.green : S.white, color: S.black }}
        >
          {label}
        </span>
        <button onClick={onBack} className="flex items-center gap-1 text-xs cursor-pointer bg-transparent border-none" style={{ color: S.grey }}>
          {Ic.aL(14, "#7e8085")}戻る
        </button>
      </div>
      <div className="h-[3px] overflow-hidden" style={{ background: S.s3 }}>
        <div className="h-full transition-[width] duration-400" style={{ background: S.green, width: `${(checked / total) * 100}%`, transitionTimingFunction: S.ease }} />
      </div>
    </div>
  );
}

function NavButtons({ idx, total, allDone, onPrev, onNext, onComplete }: {
  idx: number; total: number; allDone: boolean; onPrev: () => void; onNext: () => void; onComplete: () => void;
}) {
  return (
    <div className="flex gap-3 mt-3.5">
      <button disabled={idx === 0} onClick={onPrev}
        className="flex-1 flex items-center justify-center gap-1.5 py-[18px] rounded text-[15px] cursor-pointer transition-all active:scale-[0.97] disabled:opacity-20 disabled:cursor-default"
        style={{ background: S.s2, border: `1px solid ${S.bd}` }}>
        {Ic.aL(18)}前へ
      </button>
      {allDone ? (
        <button onClick={onComplete}
          className="flex-1 flex items-center justify-center gap-1.5 py-[18px] rounded text-[15px] cursor-pointer transition-all active:scale-[0.97]"
          style={{ background: S.green, border: `1px solid ${S.green}`, color: S.black }}>
          完了{Ic.aR(18, "#000")}
        </button>
      ) : (
        <button disabled={idx === total - 1} onClick={onNext}
          className="flex-1 flex items-center justify-center gap-1.5 py-[18px] rounded text-[15px] cursor-pointer transition-all active:scale-[0.97] disabled:opacity-20 disabled:cursor-default"
          style={{ background: S.s2, border: `1px solid ${S.bd}` }}>
          次へ{Ic.aR(18)}
        </button>
      )}
    </div>
  );
}

function CheckButton({ done, label, onClick }: { done: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center justify-center gap-2.5 py-[22px] rounded text-base cursor-pointer transition-all active:scale-[0.97]"
      style={{
        border: `2px solid ${done ? S.green : S.bd}`,
        background: done ? S.green : "transparent",
        color: done ? S.black : S.white,
        transitionTimingFunction: S.ease,
      }}>
      {done ? Ic.chk(20, "#000") : Ic.sq(20, "#fff")}
      {label}
    </button>
  );
}

function AlertStrip({ icon, color, borderColor, children }: {
  icon: React.ReactNode; color: string; borderColor: string; children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3 text-sm tracking-[-0.02em]"
      style={{ background: S.s2, borderLeft: `3px solid ${borderColor}`, color }}>
      {icon}{children}
    </div>
  );
}

function SummaryRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex justify-between items-center px-5 py-3.5 text-sm" style={{ borderBottom: `1px solid ${S.bd}` }}>
      <span style={{ color: S.grey }}>{label}</span>
      <span style={{ color: valueColor || S.white }}>{value}</span>
    </div>
  );
}

// ━━━ WebSocket ━━━
function useWebSocket(onMessage: (data: any) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;

  useEffect(() => {
    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws`);
      ws.onopen = () => console.log("[WS] 接続完了");
      ws.onmessage = (e) => {
        try { cbRef.current(JSON.parse(e.data)); } catch {}
      };
      ws.onclose = () => { setTimeout(connect, 3000); };
      wsRef.current = ws;
    }
    connect();
    return () => { wsRef.current?.close(); };
  }, []);
}

// ━━━ App ━━━
export default function App() {
  // --- 共通 state ---
  const [phase, setPhase] = useState<Phase>("home");
  const [carrier, setCarrier] = useState<Carrier>("");
  const [err, setErr] = useState("");

  // --- ピッキング state ---
  const [pickItems, setPickItems] = useState<PickingItem[]>([]);
  const [pickChecks, setPickChecks] = useState<boolean[]>([]);
  const [pickIdx, setPickIdx] = useState(0);
  const [csvOk, setCsvOk] = useState(false);
  const [csvUploading, setCsvUploading] = useState(false);

  // --- 梱包 state ---
  const [packOrders, setPackOrders] = useState<Order[]>([]);
  const [packChecks, setPackChecks] = useState<boolean[]>([]);
  const [packIdx, setPackIdx] = useState(0);
  const [pdfOk, setPdfOk] = useState(false);
  const [pdfUploading, setPdfUploading] = useState(false);

  // --- WebSocket ---
  useWebSocket(useCallback((data: any) => {
    if (data.type === "picking_loaded") {
      setCarrier(data.carrier === "sagawa" ? "sagawa" : "yamato");
      setPickItems(data.items);
      setPickChecks(new Array(data.items.length).fill(false));
      setCsvOk(true);
    }
    if (data.type === "packing_loaded") {
      setCarrier(data.carrier === "sagawa" ? "sagawa" : "yamato");
      setPackOrders(data.orders);
      setPackChecks(new Array(data.orders.length).fill(false));
      setPdfOk(true);
    }
  }, []));

  // --- セッション復元 ---
  useEffect(() => {
    fetch("/api/session").then(r => r.json()).then(s => {
      if (s.picking?.length > 0) {
        setCarrier(s.carrier === "sagawa" ? "sagawa" : "yamato");
        setPickItems(s.picking);
        setPickChecks(new Array(s.picking.length).fill(false));
        setCsvOk(true);
      }
      if (s.packing?.length > 0) {
        setPackOrders(s.packing);
        setPackChecks(new Array(s.packing.length).fill(false));
        setPdfOk(true);
      }
    }).catch(() => {});
  }, []);

  // --- スクロール ---
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [pickIdx, packIdx, phase]);

  // --- CSV アップロード ---
  const handleCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !carrier) return;
    setErr(""); setCsvUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/upload/csv?carrier=${carrier}`, { method: "POST", body: form });
      const json = await res.json();
      if (!json.success) setErr(json.error || "アップロード失敗");
    } catch (ex: any) { setErr("通信エラー: " + ex.message); }
    setCsvUploading(false);
  };

  // --- PDF アップロード ---
  const handlePDF = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !carrier) return;
    setErr(""); setPdfUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/upload/pdf?carrier=${carrier}`, { method: "POST", body: form });
      const json = await res.json();
      if (!json.success) setErr(json.error || "アップロード失敗");
    } catch (ex: any) { setErr("通信エラー: " + ex.message); }
    setPdfUploading(false);
  };

  // --- ピッキング チェック ---
  // 【修正】自動遷移ロジックをここから削除。
  // 理由: setStateは非同期バッチ処理のため、checks[i]が古い値を参照する
  // 「stale closure」が発生していた。チェック切替のみに専念させ、
  // 遷移は useEffect で最新のstateを監視して行う。
  const togglePick = useCallback((i: number) => {
    setPickChecks(prev => { const n = [...prev]; n[i] = !n[i]; return n; });
  }, []);

  // --- 梱包 チェック ---
  const togglePack = useCallback((i: number) => {
    setPackChecks(prev => { const n = [...prev]; n[i] = !n[i]; return n; });
  }, []);

  // --- 自動遷移（useEffect で最新 state を参照）---
  // 【深掘り③】stale closure の根本対策:
  //   useCallback 内で checks[i] を参照すると、依存配列の更新タイミングと
  //   連打のタイミングがずれて古い値を読む。
  //   useEffect は毎レンダリング後に最新の state で実行されるため、
  //   「直前のチェック操作で何が変わったか」を正確に検出できる。
  const prevPickChecks = useRef<boolean[]>([]);
  useEffect(() => {
    const prev = prevPickChecks.current;
    const curr = pickChecks;
    if (prev.length !== curr.length) { prevPickChecks.current = curr; return; }
    // 今回チェックされたインデックスを探す
    const justChecked = curr.findIndex((c, i) => c && !prev[i]);
    prevPickChecks.current = curr;
    if (justChecked < 0 || phase !== "picking") return;
    if (curr.every(Boolean)) {
      setTimeout(() => setPhase("pickingSummary"), 400);
    } else if (justChecked < curr.length - 1) {
      setTimeout(() => setPickIdx(justChecked + 1), 300);
    }
  }, [pickChecks, phase]);

  const prevPackChecks = useRef<boolean[]>([]);
  useEffect(() => {
    const prev = prevPackChecks.current;
    const curr = packChecks;
    if (prev.length !== curr.length) { prevPackChecks.current = curr; return; }
    const justChecked = curr.findIndex((c, i) => c && !prev[i]);
    prevPackChecks.current = curr;
    if (justChecked < 0 || phase !== "packing") return;
    if (curr.every(Boolean)) {
      setTimeout(() => setPhase("packingSummary"), 400);
    } else if (justChecked < curr.length - 1) {
      setTimeout(() => setPackIdx(justChecked + 1), 300);
    }
  }, [packChecks, phase]);

  // --- リセット ---
  const resetAll = () => {
    setPhase("home"); setCarrier(""); setErr("");
    setPickItems([]); setPickChecks([]); setPickIdx(0); setCsvOk(false);
    setPackOrders([]); setPackChecks([]); setPackIdx(0); setPdfOk(false);
  };
  const goToPacking = () => {
    setPhase("home");
    setPackOrders([]); setPackChecks([]); setPackIdx(0); setPdfOk(false);
  };

  // --- 集計 ---
  const pickChecked = pickChecks.filter(Boolean).length;
  const packChecked = packChecks.filter(Boolean).length;
  const totalPickQty = pickItems.reduce((s, r) => s + r.qty, 0);
  const pickAllDone = pickChecks.length > 0 && pickChecks.every(Boolean);
  const packAllDone = packChecks.length > 0 && packChecks.every(Boolean);
  const carrierLabel = carrier === "sagawa" ? "佐川急便" : "ヤマト運輸";

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <div className="max-w-[540px] mx-auto min-h-dvh flex flex-col">

      {/* ═══════════ HOME ═══════════ */}
      {phase === "home" && <>
        <div className="pt-10 px-5 text-center">
          <p className="font-[Roboto] font-black text-[11px] tracking-[0.2em] uppercase" style={{ color: S.green }}>DAICHU TOOLS</p>
          <h1 className="font-[Roboto] font-black text-[42px] leading-[0.95] tracking-[-1.6px] mt-2.5">
            PACKING<br /><span style={{ color: S.green }}>SUPPORT</span>
          </h1>
          <p className="text-[13px] mt-3.5 tracking-[0.02em]" style={{ color: S.grey }}>ピッキング・梱包作業支援ダッシュボード</p>
        </div>

        <div className="flex-1 flex flex-col gap-6 px-5 pt-9 pb-6">
          {err && (
            <div className="flex items-center gap-2.5 px-4 py-3.5 text-sm" style={{ background: S.s2, borderLeft: `3px solid ${S.red}`, color: S.red }}>
              {Ic.warn(18, "#e4250e")}{err}
            </div>
          )}

          {/* 配送業者 */}
          <div className="flex gap-3">
            {(["sagawa", "yamato"] as const).map(c => (
              <button key={c} onClick={() => setCarrier(c)}
                className="flex-1 flex items-center justify-center gap-2.5 py-[22px] px-3 rounded text-base cursor-pointer transition-all active:scale-[0.97]"
                style={{
                  background: carrier === c ? S.s1 : S.s2,
                  border: `2px solid ${carrier === c ? (c === "sagawa" ? S.green : S.white) : S.bd}`,
                  color: carrier === c ? S.white : S.grey,
                }}>
                {c === "sagawa" ? Ic.truck(22, carrier === c ? "#00fa27" : "#7e8085") : Ic.cat(22, carrier === c ? "#fff" : "#7e8085")}
                {c === "sagawa" ? "佐川急便" : "ヤマト運輸"}
              </button>
            ))}
          </div>

          {/* Phase 1 ピッキング */}
          <div className="rounded overflow-hidden" style={{ background: S.s1, border: `1px solid ${S.bd}` }}>
            <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${S.bd}` }}>
              {Ic.pkg(18, "#00fa27")}
              <div>
                <p className="font-[Roboto] font-extrabold text-[11px] tracking-[0.12em] uppercase" style={{ color: S.green }}>Phase 1</p>
                <p className="text-base tracking-[-0.02em]">ピッキング</p>
              </div>
            </div>
            <div className="p-5">
              <label className="block rounded text-center cursor-pointer relative py-9 px-5"
                style={{ border: csvOk ? `2px solid ${S.green}` : `2px dashed ${S.bd}` }}>
                <input type="file" accept=".csv" onChange={handleCSV} disabled={!carrier || csvUploading} className="absolute inset-0 opacity-0 cursor-pointer" />
                <div className="flex justify-center mb-3.5">
                  {csvUploading ? Ic.pkg(32, "#00fa27") : csvOk ? Ic.chkC(32, "#00fa27") : Ic.up(32, "#7e8085")}
                </div>
                <p className="text-sm" style={{ color: csvOk ? S.green : S.grey }}>
                  {csvUploading ? "読み込み中..." : csvOk ? "読み込み完了" : carrier ? "ピッキングリストCSVをアップロード" : "先に配送業者を選択"}
                </p>
                {csvOk && <p className="text-xs mt-1.5" style={{ color: S.grey }}>{pickItems.length}行 / 合計 {totalPickQty}点</p>}
              </label>
              {csvOk && (
                <button onClick={() => { setPickIdx(0); setPhase("picking"); }}
                  className="w-full flex items-center justify-center gap-2 mt-4 py-5 rounded text-[15px] cursor-pointer transition-all active:scale-[0.97]"
                  style={{ background: S.green, color: S.black }}>
                  ピッキング開始{Ic.aR(18, "#000")}
                </button>
              )}
            </div>
          </div>

          {/* Phase 2 梱包 */}
          <div className="rounded overflow-hidden" style={{ background: S.s1, border: `1px solid ${S.bd}` }}>
            <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${S.bd}` }}>
              {Ic.clip(18, "#00fa27")}
              <div>
                <p className="font-[Roboto] font-extrabold text-[11px] tracking-[0.12em] uppercase" style={{ color: S.green }}>Phase 2</p>
                <p className="text-base tracking-[-0.02em]">梱包</p>
              </div>
            </div>
            <div className="p-5">
              <label className="block rounded text-center cursor-pointer relative py-9 px-5"
                style={{ border: pdfOk ? `2px solid ${S.green}` : `2px dashed ${S.bd}` }}>
                <input type="file" accept=".pdf" onChange={handlePDF} disabled={!carrier || pdfUploading} className="absolute inset-0 opacity-0 cursor-pointer" />
                <div className="flex justify-center mb-3.5">
                  {pdfUploading ? Ic.pkg(32, "#00fa27") : pdfOk ? Ic.chkC(32, "#00fa27") : Ic.file(32, "#7e8085")}
                </div>
                <p className="text-sm" style={{ color: pdfOk ? S.green : S.grey }}>
                  {pdfUploading ? "読み込み中..." : pdfOk ? "読み込み完了" : carrier ? "受注票PDFをアップロード" : "先に配送業者を選択"}
                </p>
                {pdfOk && <p className="text-xs mt-1.5" style={{ color: S.grey }}>{packOrders.length}件の受注データ</p>}
              </label>
              {pdfOk && (
                <button onClick={() => { setPackIdx(0); setPhase("packing"); }}
                  className="w-full flex items-center justify-center gap-2 mt-4 py-5 rounded text-[15px] cursor-pointer transition-all active:scale-[0.97]"
                  style={{ background: S.white, color: S.black }}>
                  梱包開始{Ic.aR(18, "#000")}
                </button>
              )}
            </div>
          </div>
        </div>
      </>}

      {/* ═══════════ PICKING ═══════════ */}
      {phase === "picking" && pickItems.length > 0 && (() => {
        const it = pickItems[pickIdx], done = pickChecks[pickIdx];
        return <>
          <ProgressHeader current={pickIdx + 1} total={pickItems.length} checked={pickChecked} carrier={carrier} onBack={() => setPhase("home")} />
          <div className="flex-1 flex flex-col gap-4 p-5">
            <div className="flex flex-col justify-center rounded min-h-[280px] p-7 transition-all duration-300"
              style={{ background: S.s1, border: `2px solid ${done ? S.green : S.bd}`, transitionTimingFunction: S.ease }}>
              <p className="text-[22px] leading-[1.3] tracking-[-0.4px]">{it.name}</p>
              <p className="font-[Roboto] text-[13px] mt-1 tracking-[0.02em]" style={{ color: S.grey }}>{it.code}</p>
              <div className="flex flex-col gap-1 mt-5">
                {it.attr1 && <p className="text-xl tracking-[-0.3px]" style={{ color: S.green }}>{it.attr1}</p>}
                {it.attr2 && <p className="text-xl tracking-[-0.3px]" style={{ color: S.green }}>{it.attr2}</p>}
              </div>
              <div className="mt-7 text-center shrink-0">
                <p className="font-[Roboto] font-black text-[72px] leading-none tracking-[-3px]"
                  style={{ color: it.qty >= 2 ? S.green : S.white }}>×{it.qty}</p>
                <p className="font-[Roboto] font-extrabold text-[11px] mt-1.5 tracking-[0.14em] uppercase" style={{ color: S.grey }}>Picking Qty</p>
              </div>
            </div>
          </div>
          <div className="px-5 pb-6">
            <CheckButton done={done} label="ピッキング完了" onClick={() => togglePick(pickIdx)} />
            <NavButtons idx={pickIdx} total={pickItems.length} allDone={pickAllDone}
              onPrev={() => setPickIdx(i => i - 1)} onNext={() => setPickIdx(i => i + 1)} onComplete={() => setPhase("pickingSummary")} />
          </div>
        </>;
      })()}

      {/* ═══════════ PICKING SUMMARY ═══════════ */}
      {phase === "pickingSummary" && (
        <div className="flex-1 flex flex-col p-5">
          <div className="text-center pt-11 pb-9">
            <div className="flex justify-center mb-5">{Ic.chkC(52, "#00fa27")}</div>
            <p className="font-[Roboto] font-black text-[11px] tracking-[0.2em] uppercase" style={{ color: S.green }}>Complete</p>
            <p className="text-[28px] tracking-[-0.8px] mt-2">ピッキング完了</p>
            <p className="font-[Roboto] font-black text-[64px] leading-none tracking-[-2.5px] mt-2" style={{ color: S.green }}>
              {totalPickQty}<span className="text-[22px] tracking-normal">点</span>
            </p>
          </div>
          <div className="rounded overflow-hidden" style={{ background: S.s1, border: `1px solid ${S.bd}` }}>
            <SummaryRow label="配送業者" value={carrierLabel} />
            <SummaryRow label="バリエーション" value={`${pickItems.length}種`} />
            <SummaryRow label="ピッキング総数" value={`${totalPickQty}点`} />
            <SummaryRow label="チェック済み" value={`${pickChecked} / ${pickItems.length}`} valueColor="#00fa27" />
          </div>
          <div className="mt-auto pt-7 flex flex-col gap-3">
            <button onClick={goToPacking} className="w-full flex items-center justify-center gap-2 py-5 rounded text-[15px] cursor-pointer transition-all active:scale-[0.97]"
              style={{ background: S.green, color: S.black }}>梱包フェーズへ{Ic.aR(18, "#000")}</button>
            <button onClick={() => { setPickIdx(0); setPhase("picking"); }}
              className="w-full flex items-center justify-center gap-1.5 py-[18px] rounded text-[15px] cursor-pointer transition-all active:scale-[0.97]"
              style={{ background: S.s2, border: `1px solid ${S.bd}` }}>{Ic.aL(18)}ピッキングに戻る</button>
          </div>
        </div>
      )}

      {/* ═══════════ PACKING ═══════════ */}
      {phase === "packing" && packOrders.length > 0 && (() => {
        const o = packOrders[packIdx], done = packChecks[packIdx];
        const attrs = (p: Product) => [p.size, p.color].filter(Boolean).join(" / ");
        return <>
          <ProgressHeader current={packIdx + 1} total={packOrders.length} checked={packChecked} carrier={carrier} onBack={() => setPhase("home")} />
          <div className="flex-1 flex flex-col gap-3 p-5">
            {/* アラート */}
            {o.isDiffAddr && <AlertStrip icon={Ic.warn(18, "#e4250e")} color={S.red} borderColor={S.red}>注文者と届け先が異なります</AlertStrip>}
            {o.okihai && <AlertStrip icon={Ic.pin(18, "#f5a623")} color={S.amber} borderColor={S.amber}>置き配：{o.okihai}</AlertStrip>}
            {o.deliveryDate && <AlertStrip icon={Ic.cal(18, "#00fa27")} color={S.green} borderColor="#00aa14">配送希望日：{o.deliveryDate}</AlertStrip>}

            {/* カード */}
            <div className="rounded p-6 transition-all duration-300"
              style={{ background: S.s1, border: `2px solid ${done ? S.green : S.bd}`, transitionTimingFunction: S.ease }}>

              <p className="font-[Roboto] text-[13px] tracking-[0.02em]" style={{ color: S.grey }}>No. {o.mgmtNo}</p>

              {/* SHIP TO */}
              <p className="font-[Roboto] font-extrabold text-[11px] tracking-[0.14em] uppercase mt-5 mb-2 pb-2"
                style={{ color: S.grey, borderBottom: `1px solid ${S.bd}` }}>SHIP TO</p>
              <p className="text-[24px] tracking-[-0.5px]">
                {o.recipientName}<span className="text-base ml-1" style={{ color: S.grey }}>様</span>
              </p>
              <p className="text-[15px] leading-[1.6] mt-1.5" style={{ color: S.dim }}>
                〒{o.recipientPostal}<br />{o.recipientAddr}
              </p>
              {o.recipientTel && <p className="text-[13px] mt-1" style={{ color: S.grey }}>TEL {o.recipientTel}</p>}

              {/* ITEMS */}
              <p className="font-[Roboto] font-extrabold text-[11px] tracking-[0.14em] uppercase mt-6 mb-3 pb-2"
                style={{ color: S.grey, borderBottom: `1px solid ${S.bd}` }}>ITEMS</p>
              {o.products.map((p, pi) => (
                <div key={pi} className="flex items-center gap-3 rounded p-3.5 mb-2"
                  style={{ background: S.s2, border: `1px solid ${S.bd}` }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] leading-[1.3] tracking-[-0.02em]">
                      {o.products.length > 1 ? `${pi + 1}. ` : ""}{p.name}
                    </p>
                    {attrs(p) && <p className="text-sm mt-0.5" style={{ color: S.green }}>{attrs(p)}</p>}
                  </div>
                  <p className="font-[Roboto] font-black text-[24px] tracking-[-0.5px] shrink-0"
                    style={{ color: p.qty >= 2 ? S.green : S.white }}>×{p.qty}</p>
                </div>
              ))}

              <div className="text-center text-[15px] mt-3 py-2.5 rounded" style={{ border: `1px solid ${S.bd}` }}>
                商品合計 <span className="font-[Roboto] font-black text-xl tracking-[-0.3px]">{o.totalItems}</span> 点
              </div>
            </div>
          </div>
          <div className="px-5 pb-6">
            <CheckButton done={done} label="梱包完了" onClick={() => togglePack(packIdx)} />
            <NavButtons idx={packIdx} total={packOrders.length} allDone={packAllDone}
              onPrev={() => setPackIdx(i => i - 1)} onNext={() => setPackIdx(i => i + 1)} onComplete={() => setPhase("packingSummary")} />
          </div>
        </>;
      })()}

      {/* ═══════════ PACKING SUMMARY ═══════════ */}
      {phase === "packingSummary" && (
        <div className="flex-1 flex flex-col p-5">
          <div className="text-center pt-11 pb-9">
            <div className="flex justify-center mb-5">{Ic.trophy(52, "#00fa27")}</div>
            <p className="font-[Roboto] font-black text-[11px] tracking-[0.2em] uppercase" style={{ color: S.green }}>Complete</p>
            <p className="text-[28px] tracking-[-0.8px] mt-2">梱包完了</p>
            <p className="font-[Roboto] font-black text-[64px] leading-none tracking-[-2.5px] mt-2" style={{ color: S.green }}>
              {packOrders.length}<span className="text-[22px] tracking-normal">件</span>
            </p>
          </div>
          <div className="rounded overflow-hidden" style={{ background: S.s1, border: `1px solid ${S.bd}` }}>
            <SummaryRow label="配送業者" value={carrierLabel} />
            <SummaryRow label="受注件数" value={`${packOrders.length}件`} />
            <SummaryRow label="商品総数" value={`${packOrders.reduce((s, o) => s + o.totalItems, 0)}点`} />
            <SummaryRow label="配送希望日あり" value={`${packOrders.filter(o => o.deliveryDate).length}件`} />
            <SummaryRow label="置き配指定あり" value={`${packOrders.filter(o => o.okihai).length}件`} />
            <SummaryRow label="届け先相違" value={`${packOrders.filter(o => o.isDiffAddr).length}件`}
              valueColor={packOrders.filter(o => o.isDiffAddr).length > 0 ? "#e4250e" : "#00fa27"} />
          </div>
          <div className="mt-auto pt-7 flex flex-col gap-3">
            <button onClick={resetAll}
              className="w-full flex items-center justify-center gap-2 py-5 rounded text-[15px] cursor-pointer transition-all active:scale-[0.97]"
              style={{ background: S.green, color: S.black }}>次の配送業者へ / 作業終了{Ic.aR(18, "#000")}</button>
            <button onClick={() => { setPackIdx(0); setPhase("packing"); }}
              className="w-full flex items-center justify-center gap-1.5 py-[18px] rounded text-[15px] cursor-pointer transition-all active:scale-[0.97]"
              style={{ background: S.s2, border: `1px solid ${S.bd}` }}>{Ic.aL(18)}梱包に戻る</button>
          </div>
        </div>
      )}
    </div>
  );
}