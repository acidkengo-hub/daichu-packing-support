// src/App.tsx — DAICHU 梱包作業支援ツール v2
import { useState, useEffect, useCallback, useRef } from "react";
import { parseOrderCSV, comparePickingItems } from "./parsers";
import type { PickingItem, Product, Order, ParsedData, CarrierData } from "./parsers";
import { getProductUrl, getProductUrlForPicking } from "./productLinks";

type Phase = "home" | "picking" | "pickingSummary" | "packing" | "packingSummary";
type Carrier = "" | "sagawa" | "yamato" | "yamatoHarai" | "all";
type CarrierKey = Exclude<Carrier, "">;
type PickView = "card" | "list" | "group";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 進行状態の保存（配送便ごと）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
type CarrierProgress = {
  pickIdx: number; packIdx: number; groupIdx: number; pickViewMode: PickView;
  pickChecks: boolean[]; packChecks: boolean[];
  okihaiChecks: boolean[]; cautionChecks: boolean[]; flyerChecks: boolean[];
};
type ProgressStore = Partial<Record<CarrierKey, CarrierProgress>>;

const LS_KEY = "daichu-packing-v2";
type SavedState = {
  parsedData: ParsedData; carrier: Carrier; phase: Phase;
  pickIdx: number; packIdx: number; groupIdx: number; pickViewMode: PickView;
  pickChecks: boolean[]; packChecks: boolean[];
  okihaiChecks: boolean[]; cautionChecks: boolean[]; flyerChecks: boolean[];
  progress: ProgressStore;
};
function saveState(s: SavedState) { try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {} }
function loadState(): SavedState | null {
  try {
    const r = localStorage.getItem(LS_KEY);
    if (!r) return null;
    const s = JSON.parse(r) as SavedState;
    // 旧バージョン互換: 欠けているフィールドを補完
    if (s.parsedData && !s.parsedData.yamatoHarai) {
      s.parsedData.yamatoHarai = { orders: [], pickingItems: [], totalPickingQty: 0 };
    }
    if (!s.progress) s.progress = {};
    if (!s.pickViewMode) s.pickViewMode = "card";
    if (typeof s.groupIdx !== "number") s.groupIdx = 0;
    return s;
  } catch { return null; }
}
function clearState() { try { localStorage.removeItem(LS_KEY); } catch {} }

// ━━━ 梱包チェック ━━━
const CAUTION_PREFIXES = ["sandal-004", "sandal-007", "sandal-008", "m-sandal-"];
const needsCautionSheet = (o: Order): boolean => o.products.some(p => CAUTION_PREFIXES.some(pre => p.code.startsWith(pre)));

// カード下部に「カラー確認」帯を出す商品（色間違いが起きやすいもの）
const COLOR_CONFIRM_CODES = ["pet-008", "apron-001"];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// カラースウォッチ
//   dot  : 実際の色（丸いスウォッチ）
//   text : 黒背景で読める明度に持ち上げた文字色
//   ring : 暗色/白色で輪郭を出す必要があるもの
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
type Swatch = { dot: string; text: string; ring?: boolean };

const COLOR_SWATCHES: Record<string, Swatch> = {
  // 暗色（文字は明るく、ドットにリング）
  "ブラック":       { dot: "#18181b", text: "#d4d4d8", ring: true },
  "black":          { dot: "#18181b", text: "#d4d4d8", ring: true },
  "ネイビー":       { dot: "#1e3a5f", text: "#93b4d8", ring: true },
  "navy":           { dot: "#1e3a5f", text: "#93b4d8", ring: true },
  "インディゴ":     { dot: "#4338CA", text: "#a5b4fc" },
  "indigo":         { dot: "#4338CA", text: "#a5b4fc" },
  "ブラウン":       { dot: "#92400E", text: "#d6a06a" },
  "brown":          { dot: "#92400E", text: "#d6a06a" },
  "コーヒー":       { dot: "#6F4E37", text: "#c9a27e" },
  "アーミーグリーン": { dot: "#4B5320", text: "#a8b56a" },
  "カーキ":         { dot: "#8F7A45", text: "#ccb87e" },
  // 中間色
  "ブルー":         { dot: "#2563EB", text: "#7ba7ff" },
  "blue":           { dot: "#2563EB", text: "#7ba7ff" },
  "ライトブルー":   { dot: "#87CEEB", text: "#9fd8f2" },
  "lblue":          { dot: "#87CEEB", text: "#9fd8f2" },
  "パープル":       { dot: "#A855F7", text: "#c9a0fb" },
  "purple":         { dot: "#A855F7", text: "#c9a0fb" },
  "グリーン":       { dot: "#22C55E", text: "#4ade80" },
  "green":          { dot: "#22C55E", text: "#4ade80" },
  "レッド":         { dot: "#DC2626", text: "#f87171" },
  "red":            { dot: "#DC2626", text: "#f87171" },
  "オレンジ":       { dot: "#F97316", text: "#fb923c" },
  "orange":         { dot: "#F97316", text: "#fb923c" },
  "イエロー":       { dot: "#EAB308", text: "#facc15" },
  "yellow":         { dot: "#EAB308", text: "#facc15" },
  "ピンク":         { dot: "#F472B6", text: "#f9a8d4" },
  "pink":           { dot: "#F472B6", text: "#f9a8d4" },
  // 明色（文字はほぼそのまま、白系はリング）
  "グレー":         { dot: "#9CA3AF", text: "#cbd0d6" },
  "gray":           { dot: "#9CA3AF", text: "#cbd0d6" },
  "シルバー":       { dot: "#C0C4CC", text: "#dfe3e8" },
  "silver":         { dot: "#C0C4CC", text: "#dfe3e8" },
  "ベージュ":       { dot: "#D9C6A5", text: "#e5d5b8" },
  "beige":          { dot: "#D9C6A5", text: "#e5d5b8" },
  "杏":             { dot: "#E8A87C", text: "#f0bd9a" },
  "ホワイト":       { dot: "#F4F4F5", text: "#f4f4f5", ring: true },
  "white":          { dot: "#F4F4F5", text: "#f4f4f5", ring: true },
};

// 「ライトブルー」が「ブルー」に誤マッチしないよう、キー名の長い順に照合する
const SWATCH_KEYS = Object.keys(COLOR_SWATCHES).sort((a, b) => b.length - a.length);

function getSwatch(text: string): Swatch | null {
  if (!text) return null;
  const t = text.trim();
  if (COLOR_SWATCHES[t]) return COLOR_SWATCHES[t];
  for (const k of SWATCH_KEYS) { if (t.includes(k)) return COLOR_SWATCHES[k]; }
  return null;
}

/** 商品の属性からカラー属性を特定（属性2 → 属性1 の順に探索） */
function findColorAttr(p: Product | PickingItem): { attr: string; sw: Swatch; other: string } | null {
  const s2 = getSwatch(p.attr2);
  if (s2) return { attr: p.attr2, sw: s2, other: p.attr1 };
  const s1 = getSwatch(p.attr1);
  if (s1) return { attr: p.attr1, sw: s1, other: p.attr2 };
  return null;
}

const SWIMWEAR_LABELS: Record<string, string> = { "ladiesfashion-002":"ビキニ・セパレート","ladiesfashion-010":"ワンピース無地 (na002)","ladiesfashion-013":"ワンピース花柄 (na004)" };
const isSwimwear = (p: Product): boolean => p.code in SWIMWEAR_LABELS;

// ━━━ 店舗カラー ━━━
type StoreKey = "yahoo"|"rakuten"|"mercari"|"amazon"|"other";
const STORE_CONFIG: Record<StoreKey, { label: string; color: string }> = {
  yahoo:{ label:"ヤフショ", color:"#FF4444" }, rakuten:{ label:"楽天市場", color:"#E6B422" },
  mercari:{ label:"メルカリ", color:"#00BFFF" }, amazon:{ label:"Amazon", color:"#FF9900" },
  other:{ label:"その他", color:"#7e8085" },
};
function getStoreKey(sn: string): StoreKey { if(sn.includes("ヤフショ"))return"yahoo";if(sn.includes("楽天"))return"rakuten";if(sn.includes("メルカリ"))return"mercari";if(sn.includes("Amazon"))return"amazon";return"other"; }

const CAMPAIGN_LS_KEY = "daichu-campaign";
type CampaignSettings = Record<StoreKey, boolean>;
const DEFAULT_CAMPAIGN: CampaignSettings = { yahoo:false, rakuten:true, mercari:false, amazon:false, other:false };
function loadCampaign(): CampaignSettings { try { const r=localStorage.getItem(CAMPAIGN_LS_KEY); return r?{...DEFAULT_CAMPAIGN,...JSON.parse(r)}:DEFAULT_CAMPAIGN; } catch { return DEFAULT_CAMPAIGN; } }
function saveCampaign(s: CampaignSettings) { try { localStorage.setItem(CAMPAIGN_LS_KEY, JSON.stringify(s)); } catch {} }

function buildAllPickingItems(data: ParsedData): PickingItem[] {
  const merged = new Map<string, PickingItem>();
  for (const item of [...data.sagawa.pickingItems, ...data.yamato.pickingItems, ...data.yamatoHarai.pickingItems]) {
    const key = `${item.code}|${item.attr1}|${item.attr2}`;
    const ex = merged.get(key);
    if (ex) { ex.qty += item.qty; } else { merged.set(key, { ...item }); }
  }
  const items = [...merged.values()];
  items.sort(comparePickingItems);
  items.forEach((it, i) => { it.id = i; });
  return items;
}

// ━━━ SVGアイコン ━━━
const Ic = {
  truck:(s=24,c="currentColor")=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
  cat:(s=24,c="currentColor")=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5c-1.5-2.5-5-3-6-1s0 4 1 5c-1.5 1-2 3-2 5 0 3 2.5 5 7 5s7-2 7-5c0-2-.5-4-2-5 1-1 2-3 1-5s-4.5-1.5-6 1z"/><path d="M10 14h.01M14 14h.01M10 17c.5.5 1.5 1 2 1s1.5-.5 2-1"/></svg>,
  pkg:(s=24,c="currentColor")=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>,
  clip:(s=24,c="currentColor")=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 14l2 2 4-4"/></svg>,
  up:(s=24,c="currentColor")=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>,
  chk:(s=24,c="currentColor")=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>,
  chkC:(s=24,c="currentColor")=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>,
  sq:(s=24,c="currentColor")=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>,
  aL:(s=24,c="currentColor")=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>,
  aR:(s=24,c="currentColor")=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>,
  warn:(s=24,c="currentColor")=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  pin:(s=24,c="currentColor")=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  cal:(s=24,c="currentColor")=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  file:(s=24,c="currentColor")=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  trophy:(s=24,c="currentColor")=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22h10c0-2-.85-3.25-2.03-3.79A1.07 1.07 0 0114 17v-2.34"/><path d="M18 2H6v7a6 6 0 1012 0V2z"/></svg>,
  link:(s=24,c="currentColor")=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>,
  gear:(s=24,c="currentColor")=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
};

const S={green:"var(--green)",black:"var(--black)",white:"var(--white)",grey:"var(--grey)",dim:"var(--dim)",s1:"var(--s1)",s2:"var(--s2)",s3:"var(--s3)",bd:"var(--border)",red:"var(--red)",amber:"var(--amber)",ease:"var(--ease)"};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 小コンポーネント
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ヘッダー：進捗 + 配送便バッジ + 前へ/次へ（誤操作防止のため下部から移設） */
function ProgressHeader({ current, total, checked, carrier, onBack, onPrev, onNext, canPrev, canNext }: {
  current: number; total: number; checked: number; carrier: Carrier; onBack: () => void;
  onPrev?: () => void; onNext?: () => void; canPrev?: boolean; canNext?: boolean;
}) {
  const label = carrier==="sagawa"?"佐川急便":carrier==="yamato"?"ヤマト運輸":carrier==="yamatoHarai"?"ヤマト発払い":"全商品一括";
  const bg = carrier==="sagawa"?S.green:carrier==="yamato"?S.white:carrier==="yamatoHarai"?"#f97316":"#a78bfa";
  const navBtn = "flex items-center justify-center w-[46px] h-[46px] rounded cursor-pointer transition-all active:scale-90 disabled:opacity-20 disabled:cursor-default";
  return (
    <div className="flex flex-col gap-3 px-5 pt-3">
      <div className="flex items-center justify-between gap-3">
        {/* 左：前へ/次へ + 進捗 */}
        <div className="flex items-center gap-2">
          {onPrev && (
            <button onClick={onPrev} disabled={!canPrev} aria-label="前へ" className={navBtn}
              style={{ background: S.s2, border: `1px solid ${S.bd}` }}>{Ic.aL(22)}</button>
          )}
          {onNext && (
            <button onClick={onNext} disabled={!canNext} aria-label="次へ" className={navBtn}
              style={{ background: S.s2, border: `1px solid ${S.bd}` }}>{Ic.aR(22)}</button>
          )}
          <p className="font-[Roboto] font-extrabold text-[14px] tracking-[0.04em] ml-1" style={{ color: S.grey }}>
            <span className="text-[24px] tracking-[-0.5px]" style={{ color: S.white }}>{current}</span>
            {" / "}{total}
            <span className="ml-2" style={{ color: S.green }}>({checked})</span>
          </p>
        </div>
        {/* 中：配送便 */}
        <span className="font-[Roboto] font-extrabold text-[12px] tracking-[0.08em] uppercase px-4 py-[6px] rounded-full shrink-0"
          style={{ background: bg, color: S.black }}>{label}</span>
        {/* 右：戻る */}
        <button onClick={onBack} className="flex items-center gap-1 text-[13px] cursor-pointer bg-transparent border-none shrink-0"
          style={{ color: S.grey }}>{Ic.aL(15,"#7e8085")}戻る</button>
      </div>
      <div className="h-[3px] overflow-hidden" style={{ background: S.s3 }}>
        <div className="h-full transition-[width] duration-400"
          style={{ background: S.green, width: `${total ? (checked/total)*100 : 0}%`, transitionTimingFunction: S.ease }} />
      </div>
    </div>
  );
}

function CheckButton({done,label,onClick,disabled}:{done:boolean;label:string;onClick:()=>void;disabled?:boolean}){
  return <button onClick={onClick} disabled={disabled}
    className="w-full flex items-center justify-center gap-2.5 py-[24px] rounded text-[17px] cursor-pointer transition-all active:scale-[0.97] disabled:cursor-default"
    style={{border:`2px solid ${done?S.green:S.bd}`,background:done?S.green:"transparent",color:done?S.black:S.white,opacity:disabled?0.35:1,transitionTimingFunction:S.ease}}>
    {done?Ic.chk(22,"#000"):Ic.sq(22,"#fff")}{label}
  </button>;
}

/** 全件完了時のみ出す「完了」ボタン（自動遷移のフォールバック） */
function DoneButton({onClick,label}:{onClick:()=>void;label:string}){
  return <button onClick={onClick}
    className="w-full flex items-center justify-center gap-2 py-[18px] rounded text-[15px] cursor-pointer transition-all active:scale-[0.97] mt-3"
    style={{background:S.green,color:S.black}}>{label}{Ic.aR(18,"#000")}</button>;
}

function AlertStrip({icon,color,borderColor,children}:{icon:React.ReactNode;color:string;borderColor:string;children:React.ReactNode}){
  return <div className="flex items-center gap-3 px-4 py-4 text-[16px] tracking-[-0.02em] min-h-[60px]"
    style={{background:S.s2,borderLeft:`3px solid ${borderColor}`,color}}>{icon}{children}</div>;
}

function CheckStrip({icon,color,borderColor,checked,onToggle,highlight,children}:{icon:React.ReactNode;color:string;borderColor:string;checked:boolean;onToggle:()=>void;highlight?:boolean;children:React.ReactNode}){
  return <button onClick={onToggle}
    className="w-full flex items-center gap-3.5 px-4 py-5 text-[17px] tracking-[-0.02em] text-left cursor-pointer transition-all min-h-[76px]"
    style={{background:checked?S.s1:S.s2,borderLeft:`4px solid ${checked?"#00fa27":borderColor}`,borderTop:"none",borderRight:"none",borderBottom:"none",color:checked?S.green:color,animation:highlight?"pulse-warn 0.6s ease":undefined}}>
    <span className="shrink-0 flex items-center justify-center w-[36px] h-[36px]" style={{opacity:checked?1:0.8}}>
      {checked?Ic.chk(28,"#00fa27"):Ic.sq(28,color)}
    </span>
    <span className="shrink-0">{icon}</span>
    <span className="flex-1">{children}</span>
  </button>;
}

function SummaryRow({label,value,valueColor}:{label:string;value:string;valueColor?:string}){
  return <div className="flex justify-between items-center px-5 py-3.5 text-[15px]" style={{borderBottom:`1px solid ${S.bd}`}}>
    <span style={{color:S.grey}}>{label}</span><span style={{color:valueColor||S.white}}>{value}</span></div>;
}

function SwimwearBadge({code}:{code:string}){
  const l=SWIMWEAR_LABELS[code]; if(!l)return null;
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-[12px] font-[Roboto] font-extrabold tracking-[0.04em]"
    style={{background:"#1e3a5f",color:"#60a5fa",border:"1px solid #2563EB44"}}>{l}</span>;
}

/** カラースウォッチ（丸）+ カラー名。暗色/白はリングで輪郭を出す */
function ColorChip({ sw, label, size = 24, textSize = 26 }: { sw: Swatch; label: string; size?: number; textSize?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="inline-block rounded-full shrink-0"
        style={{
          width: size, height: size, background: sw.dot,
          border: sw.ring ? "2px solid rgba(255,255,255,0.85)" : "2px solid rgba(255,255,255,0.28)",
          boxShadow: `0 0 8px ${sw.dot}88`,
        }} />
      <span className="font-[Roboto] font-extrabold tracking-[-0.3px]" style={{ fontSize: textSize, color: sw.text }}>{label}</span>
    </span>
  );
}

// ━━━ ビュー切替ボタン ━━━
function ViewToggle({mode, onChange}:{mode: PickView; onChange:(m:PickView)=>void}){
  const modes:[PickView,string][] = [["card","📇"],["list","📋"],["group","📦"]];
  return<div className="flex mx-5 mt-3 rounded overflow-hidden" style={{border:`1px solid ${S.bd}`}}>
    {modes.map(([m,icon])=><button key={m} onClick={()=>onChange(m)}
      className="flex-1 py-3 text-center text-[20px] cursor-pointer transition-all"
      style={{background:mode===m?"rgba(0,250,39,0.15)":"transparent",border:"none",borderRight:`1px solid ${S.bd}`,color:mode===m?S.green:S.grey}}>
      {icon}
    </button>)}
  </div>;
}

/** ホーム画面の作業進捗ラベル */
function ProgressBadge({ done, total }: { done: number; total: number }) {
  if (total === 0 || done === 0) return null;
  const complete = done === total;
  return <p className="text-[12px] mt-1 font-[Roboto] font-extrabold"
    style={{ color: complete ? S.green : "#f5a623" }}>
    {complete ? "✓ 完了" : `作業中 ${done}/${total}`}</p>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// App
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function App(){
  const saved=useRef(loadState());
  const [parsedData,setParsedData]=useState<ParsedData|null>(saved.current?.parsedData??null);
  const [phase,setPhase]=useState<Phase>(saved.current?.phase??"home");
  const [carrier,setCarrier]=useState<Carrier>(saved.current?.carrier??"");
  const [err,setErr]=useState("");const [uploading,setUploading]=useState(false);
  const cd:CarrierData|null=parsedData?carrier==="sagawa"?parsedData.sagawa:carrier==="yamato"?parsedData.yamato:carrier==="yamatoHarai"?parsedData.yamatoHarai:null:null;
  const pickItems=carrier==="all"&&parsedData?buildAllPickingItems(parsedData):cd?.pickingItems??[];
  const packOrders=cd?.orders??[];
  const [pickIdx,setPickIdx]=useState(saved.current?.pickIdx??0);
  const [packIdx,setPackIdx]=useState(saved.current?.packIdx??0);
  const [pickChecks,setPickChecks]=useState<boolean[]>(saved.current?.pickChecks??[]);
  const [packChecks,setPackChecks]=useState<boolean[]>(saved.current?.packChecks??[]);
  const [okihaiChecks,setOkihaiChecks]=useState<boolean[]>(saved.current?.okihaiChecks??[]);
  const [cautionChecks,setCautionChecks]=useState<boolean[]>(saved.current?.cautionChecks??[]);
  const [flyerChecks,setFlyerChecks]=useState<boolean[]>(saved.current?.flyerChecks??[]);
  const [highlightMissing,setHighlightMissing]=useState(false);
  const [campaign,setCampaign]=useState<CampaignSettings>(loadCampaign());
  const [showSettings,setShowSettings]=useState(false);
  const [showCatalog,setShowCatalog]=useState(false);
  const [pickViewMode,setPickViewMode]=useState<PickView>(saved.current?.pickViewMode??"card");
  const [groupIdx,setGroupIdx]=useState(saved.current?.groupIdx??0);
  const [progress,setProgress]=useState<ProgressStore>(saved.current?.progress??{});

  // --- localStorage 自動保存 ---
  useEffect(()=>{
    if(!parsedData)return;
    saveState({parsedData,carrier,phase,pickIdx,packIdx,groupIdx,pickViewMode,pickChecks,packChecks,okihaiChecks,cautionChecks,flyerChecks,progress});
  },[parsedData,carrier,phase,pickIdx,packIdx,groupIdx,pickViewMode,pickChecks,packChecks,okihaiChecks,cautionChecks,flyerChecks,progress]);

  useEffect(()=>{window.scrollTo({top:0,behavior:"instant"});},[pickIdx,packIdx,groupIdx,phase]);

  // --- 進行状態の退避 / 参照 ---
  /** 現在の作業状態を progress に退避 */
  const stashProgress=()=>{
    if(carrier==="")return;
    const snapshot:CarrierProgress={pickIdx,packIdx,groupIdx,pickViewMode,pickChecks,packChecks,okihaiChecks,cautionChecks,flyerChecks};
    setProgress(prev=>({...prev,[carrier]:snapshot}));
  };

  /** 配送便のアイテム数 / 注文数 */
  const countsOf=(c:CarrierKey,data:ParsedData)=>{
    if(c==="all")return{items:buildAllPickingItems(data).length,orders:0};
    const d=c==="sagawa"?data.sagawa:c==="yamatoHarai"?data.yamatoHarai:data.yamato;
    return{items:d.pickingItems.length,orders:d.orders.length};
  };

  const handleCSV=async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];if(!file)return;
    setErr("");setUploading(true);
    try{
      const data=await parseOrderCSV(file);
      if(data.sagawa.orders.length+data.yamato.orders.length+data.yamatoHarai.orders.length===0){
        setErr("注文データが見つかりません");
      }else{
        // 別の注文データになるため進行状態はクリア
        setParsedData(data);setCarrier("");setPhase("home");setProgress({});
        setPickChecks([]);setPackChecks([]);setOkihaiChecks([]);setCautionChecks([]);setFlyerChecks([]);
        setPickIdx(0);setPackIdx(0);setGroupIdx(0);
      }
    }catch(ex:unknown){setErr("CSV解析エラー: "+(ex instanceof Error?ex.message:String(ex)));}
    setUploading(false);
  };

  /** フェーズ開始（保存済み進行があれば復元） */
  const startPhase=(c:Carrier,tp:"picking"|"packing")=>{
    if(!parsedData||c==="")return;
    stashProgress(); // 別配送便から直接切り替える場合にも退避
    const {items,orders}=countsOf(c,parsedData);
    const sv=progress[c];
    const valid=sv&&sv.pickChecks.length===items&&sv.packChecks.length===orders;
    setCarrier(c);
    if(valid&&sv){
      setPickIdx(Math.min(sv.pickIdx,Math.max(items-1,0)));
      setPackIdx(Math.min(sv.packIdx,Math.max(orders-1,0)));
      setGroupIdx(sv.groupIdx??0);
      setPickViewMode(sv.pickViewMode??"card");
      setPickChecks(sv.pickChecks);setPackChecks(sv.packChecks);
      setOkihaiChecks(sv.okihaiChecks);setCautionChecks(sv.cautionChecks);setFlyerChecks(sv.flyerChecks);
      // 既に全完了ならサマリーを表示
      if(tp==="picking"&&items>0&&sv.pickChecks.every(Boolean)){setPhase("pickingSummary");return;}
      if(tp==="packing"&&orders>0&&sv.packChecks.every(Boolean)){setPhase("packingSummary");return;}
    }else{
      setPickIdx(0);setPackIdx(0);setGroupIdx(0);setPickViewMode("card");
      setPickChecks(new Array(items).fill(false));
      setPackChecks(new Array(orders).fill(false));
      setOkihaiChecks(new Array(orders).fill(false));
      setCautionChecks(new Array(orders).fill(false));
      setFlyerChecks(new Array(orders).fill(false));
    }
    setPhase(tp);
  };

  const togglePick=useCallback((i:number)=>{setPickChecks(p=>{const n=[...p];n[i]=!n[i];return n;});},[]);
  const togglePack=useCallback((i:number)=>{setPackChecks(p=>{const n=[...p];n[i]=!n[i];return n;});},[]);
  const toggleOkihaiCheck=useCallback((i:number)=>{setOkihaiChecks(p=>{const n=[...p];n[i]=!n[i];return n;});},[]);
  const toggleCautionCheck=useCallback((i:number)=>{setCautionChecks(p=>{const n=[...p];n[i]=!n[i];return n;});},[]);
  const toggleFlyerCheck=useCallback((i:number)=>{setFlyerChecks(p=>{const n=[...p];n[i]=!n[i];return n;});},[]);

  const handlePackComplete=useCallback((idx:number)=>{
    const o=packOrders[idx];
    const ok1=!o.okihai||okihaiChecks[idx];
    const ok2=!needsCautionSheet(o)||cautionChecks[idx];
    const sk=getStoreKey(o.shopName);
    const ok3=!campaign[sk]||flyerChecks[idx];
    if(!ok1||!ok2||!ok3){setHighlightMissing(true);setTimeout(()=>setHighlightMissing(false),700);return;}
    togglePack(idx);
  },[packOrders,okihaiChecks,cautionChecks,flyerChecks,campaign,togglePack]);

  // グループデータ（ピッキング用）
  const pickGroups=(()=>{
    const codes:string[]=[];
    for(const it of pickItems){ if(!codes.includes(it.code))codes.push(it.code); }
    return codes.map(code=>({code,items:pickItems.filter(p=>p.code===code),name:pickItems.find(p=>p.code===code)!.name}));
  })();

  // --- 自動遷移 ---
  const prevPickChecks=useRef<boolean[]>([]);
  useEffect(()=>{
    const prev=prevPickChecks.current,curr=pickChecks;
    if(prev.length!==curr.length){prevPickChecks.current=curr;return;}
    const j=curr.findIndex((c,i)=>c&&!prev[i]);
    prevPickChecks.current=curr;
    if(j<0||phase!=="picking")return;
    if(curr.every(Boolean)){setTimeout(()=>setPhase("pickingSummary"),400);return;}
    if(pickViewMode==="card"&&j<curr.length-1){setTimeout(()=>setPickIdx(j+1),300);}
    if(pickViewMode==="group"){
      const g=pickGroups[groupIdx];
      if(g&&g.items.every(it=>curr[it.id])&&groupIdx<pickGroups.length-1){setTimeout(()=>setGroupIdx(groupIdx+1),400);}
    }
  },[pickChecks,phase,pickViewMode,pickGroups,groupIdx]);

  const prevPackChecks=useRef<boolean[]>([]);
  useEffect(()=>{
    const prev=prevPackChecks.current,curr=packChecks;
    if(prev.length!==curr.length){prevPackChecks.current=curr;return;}
    const j=curr.findIndex((c,i)=>c&&!prev[i]);
    prevPackChecks.current=curr;
    if(j<0||phase!=="packing")return;
    if(curr.every(Boolean)){setTimeout(()=>setPhase("packingSummary"),400);}
    else if(j<curr.length-1){setTimeout(()=>setPackIdx(j+1),300);}
  },[packChecks,phase]);

  // --- 画面遷移 ---
  const clearWorking=()=>{
    setPickChecks([]);setPickIdx(0);setPackChecks([]);setPackIdx(0);
    setOkihaiChecks([]);setCautionChecks([]);setFlyerChecks([]);setGroupIdx(0);
  };
  const resetAll=()=>{
    clearState();setParsedData(null);setPhase("home");setCarrier("");setErr("");
    setProgress({});clearWorking();
  };
  const goToPacking=()=>{setPackIdx(0);setPhase("packing");};
  /** ホームに戻る（進行状態を退避してから作業用stateをクリア） */
  const goToHome=()=>{stashProgress();setPhase("home");setCarrier("");clearWorking();};

  const pickChecked=pickChecks.filter(Boolean).length;
  const packChecked=packChecks.filter(Boolean).length;
  const totalPickQty=pickItems.reduce((s,r)=>s+r.qty,0);
  const pickAllDone=pickChecks.length>0&&pickChecks.every(Boolean);
  const packAllDone=packChecks.length>0&&packChecks.every(Boolean);
  const carrierLabel=carrier==="sagawa"?"佐川急便":carrier==="yamato"?"ヤマト運輸":carrier==="yamatoHarai"?"ヤマト発払い":"全商品一括";

  /** ホーム画面用: 保存済み進行のチェック済み件数 */
  const savedPickDone=(c:CarrierKey)=>progress[c]?.pickChecks.filter(Boolean).length??0;
  const savedPackDone=(c:CarrierKey)=>progress[c]?.packChecks.filter(Boolean).length??0;

  return(<div className="max-w-[780px] mx-auto min-h-dvh flex flex-col">

    {/* ═══ HOME ═══ */}
    {phase==="home"&&<>
      <div className="pt-10 px-5 text-center">
        <p className="font-[Roboto] font-black text-[11px] tracking-[0.2em] uppercase" style={{color:S.green}}>DAICHU TOOLS</p>
        <h1 className="font-[Roboto] font-black text-[42px] leading-[0.95] tracking-[-1.6px] mt-2.5">PACKING<br/><span style={{color:S.green}}>SUPPORT</span></h1>
        <p className="text-[13px] mt-3.5 tracking-[0.02em]" style={{color:S.grey}}>ピッキング・梱包作業支援ダッシュボード</p>
      </div>
      <div className="flex-1 flex flex-col gap-6 px-5 pt-9 pb-6">
        {err&&<div className="flex items-center gap-2.5 px-4 py-3.5 text-sm" style={{background:S.s2,borderLeft:`3px solid ${S.red}`,color:S.red}}>{Ic.warn(18,"#e4250e")}{err}</div>}

        {/* CSV読み込み */}
        <div className="rounded overflow-hidden" style={{background:S.s1,border:`1px solid ${S.bd}`}}>
          <div className="flex items-center gap-3 px-5 py-4" style={{borderBottom:`1px solid ${S.bd}`}}>{Ic.file(18,"#00fa27")}<div><p className="font-[Roboto] font-extrabold text-[11px] tracking-[0.12em] uppercase" style={{color:S.green}}>STEP 1</p><p className="text-base tracking-[-0.02em]">注文詳細CSVを読み込む</p></div></div>
          <div className="p-5"><label className="block rounded text-center cursor-pointer relative py-9 px-5" style={{border:parsedData?`2px solid ${S.green}`:`2px dashed ${S.bd}`}}>
            <input type="file" accept=".csv" onChange={handleCSV} disabled={uploading} className="absolute inset-0 opacity-0 cursor-pointer"/>
            <div className="flex justify-center mb-3.5">{uploading?Ic.pkg(32,"#00fa27"):parsedData?Ic.chkC(32,"#00fa27"):Ic.up(32,"#7e8085")}</div>
            <p className="text-sm" style={{color:parsedData?S.green:S.grey}}>{uploading?"読み込み中...":parsedData?"読み込み完了（タップで再読み込み）":"CROSS MALL 注文詳細CSVをアップロード"}</p>
            {parsedData&&<p className="text-xs mt-1.5" style={{color:S.grey}}>佐川 {parsedData.sagawa.orders.length}件 / ヤマト {parsedData.yamato.orders.length}件{parsedData.yamatoHarai.orders.length>0&&` / 発払い ${parsedData.yamatoHarai.orders.length}件`}</p>}
          </label></div>
        </div>

        {/* キャンペーン設定 */}
        <div className="rounded overflow-hidden" style={{background:S.s1,border:`1px solid ${S.bd}`}}>
          <button onClick={()=>setShowSettings(!showSettings)} className="w-full flex items-center gap-3 px-5 py-4 cursor-pointer text-left" style={{background:"transparent",border:"none",borderBottom:showSettings?`1px solid ${S.bd}`:"none"}}>
            {Ic.gear(18,"#7e8085")}<div className="flex-1"><p className="text-[14px]">チラシ同封キャンペーン設定</p></div><span className="text-[12px]" style={{color:S.grey}}>{showSettings?"閉じる":"開く"}</span>
          </button>
          {showSettings&&<div className="p-4 flex flex-col gap-2">{(["yahoo","rakuten","mercari","amazon"] as StoreKey[]).map(key=>{const conf=STORE_CONFIG[key];const active=campaign[key];return<button key={key} onClick={()=>{const next={...campaign,[key]:!active};setCampaign(next);saveCampaign(next);}} className="flex items-center gap-3 px-4 py-3.5 rounded cursor-pointer transition-all" style={{background:active?`${conf.color}18`:S.s2,border:`1px solid ${active?conf.color:S.bd}`}}><span className="w-3 h-3 rounded-full shrink-0" style={{background:conf.color}}/><p className="flex-1 text-[16px] text-left" style={{color:active?conf.color:S.grey}}>{conf.label}</p><span className="font-[Roboto] font-extrabold text-[13px]" style={{color:active?conf.color:S.grey}}>{active?"ON":"OFF"}</span></button>;})}</div>}
        </div>

        {/* 配送便選択 */}
        {parsedData&&<div className="flex flex-col gap-4">
          {([["sagawa","佐川急便",parsedData.sagawa],["yamato","ヤマト運輸",parsedData.yamato]] as const).map(([key,label,data])=>
            <div key={key} className="rounded overflow-hidden" style={{background:S.s1,border:`1px solid ${S.bd}`}}>
              <div className="flex items-center gap-3 px-5 py-4" style={{borderBottom:`1px solid ${S.bd}`}}>{key==="sagawa"?Ic.truck(20,"#00fa27"):Ic.cat(20,"#fff")}<div><p className="text-[17px]">{label}</p><p className="text-[12px] mt-0.5" style={{color:S.grey}}>{data.orders.length}件</p></div></div>
              <div className="p-4 flex gap-3">
                <button onClick={()=>startPhase(key,"picking")} disabled={data.pickingItems.length===0} className="flex-1 flex flex-col items-center gap-1.5 py-5 rounded cursor-pointer transition-all active:scale-[0.97] disabled:opacity-30 disabled:cursor-default" style={{background:S.s2,border:`2px solid ${S.bd}`}}>
                  {Ic.pkg(22,"#00fa27")}<p className="text-[15px]">ピッキング</p>
                  <p className="text-[12px]" style={{color:S.grey}}>{data.pickingItems.length}種 {data.totalPickingQty}点</p>
                  <ProgressBadge done={savedPickDone(key)} total={data.pickingItems.length}/>
                </button>
                <button onClick={()=>startPhase(key,"packing")} disabled={data.orders.length===0} className="flex-1 flex flex-col items-center gap-1.5 py-5 rounded cursor-pointer transition-all active:scale-[0.97] disabled:opacity-30 disabled:cursor-default" style={{background:S.s2,border:`2px solid ${S.bd}`}}>
                  {Ic.clip(22,"#00fa27")}<p className="text-[15px]">梱包</p>
                  <p className="text-[12px]" style={{color:S.grey}}>{data.orders.length}件</p>
                  <ProgressBadge done={savedPackDone(key)} total={data.orders.length}/>
                </button>
              </div>
            </div>)}

          {/* ヤマト発払い（該当注文がある場合のみ） */}
          {parsedData.yamatoHarai.orders.length>0&&<div className="rounded overflow-hidden" style={{background:S.s1,border:`1px solid ${S.bd}`}}>
            <div className="flex items-center gap-3 px-5 py-4" style={{borderBottom:`1px solid ${S.bd}`}}>{Ic.truck(20,"#f97316")}<div><p className="text-[17px]">ヤマト発払い</p><p className="text-[12px] mt-0.5" style={{color:S.grey}}>{parsedData.yamatoHarai.orders.length}件</p></div></div>
            <div className="p-4 flex gap-3">
              <button onClick={()=>startPhase("yamatoHarai","picking")} disabled={parsedData.yamatoHarai.pickingItems.length===0} className="flex-1 flex flex-col items-center gap-1.5 py-5 rounded cursor-pointer transition-all active:scale-[0.97] disabled:opacity-30 disabled:cursor-default" style={{background:S.s2,border:`2px solid ${S.bd}`}}>
                {Ic.pkg(22,"#f97316")}<p className="text-[15px]">ピッキング</p>
                <p className="text-[12px]" style={{color:S.grey}}>{parsedData.yamatoHarai.pickingItems.length}種 {parsedData.yamatoHarai.totalPickingQty}点</p>
                <ProgressBadge done={savedPickDone("yamatoHarai")} total={parsedData.yamatoHarai.pickingItems.length}/>
              </button>
              <button onClick={()=>startPhase("yamatoHarai","packing")} disabled={parsedData.yamatoHarai.orders.length===0} className="flex-1 flex flex-col items-center gap-1.5 py-5 rounded cursor-pointer transition-all active:scale-[0.97] disabled:opacity-30 disabled:cursor-default" style={{background:S.s2,border:`2px solid ${S.bd}`}}>
                {Ic.clip(22,"#f97316")}<p className="text-[15px]">梱包</p>
                <p className="text-[12px]" style={{color:S.grey}}>{parsedData.yamatoHarai.orders.length}件</p>
                <ProgressBadge done={savedPackDone("yamatoHarai")} total={parsedData.yamatoHarai.orders.length}/>
              </button>
            </div>
          </div>}

          {/* 全商品一括ピッキング */}
          <button onClick={()=>startPhase("all","picking")} disabled={parsedData.sagawa.pickingItems.length+parsedData.yamato.pickingItems.length+parsedData.yamatoHarai.pickingItems.length===0} className="w-full flex items-center justify-center gap-3 py-5 rounded cursor-pointer transition-all active:scale-[0.97] disabled:opacity-30 disabled:cursor-default" style={{background:S.s2,border:`2px solid ${S.bd}`}}>
            {Ic.pkg(22,"#00fa27")}
            <div className="text-left">
              <p className="text-[15px]">全商品一括ピッキング</p>
              <p className="text-[12px]" style={{color:S.grey}}>全配送便合計 {parsedData.sagawa.totalPickingQty+parsedData.yamato.totalPickingQty+parsedData.yamatoHarai.totalPickingQty}点</p>
              <ProgressBadge done={savedPickDone("all")} total={buildAllPickingItems(parsedData).length}/>
            </div>
          </button>
        </div>}
      </div>
    </>}

    {/* ═══ PICKING ═══ */}
    {phase==="picking"&&pickItems.length>0&&(()=>{
      const it=pickItems[pickIdx],done=pickChecks[pickIdx];
      // ビューモードごとにヘッダーの進捗表示とナビ対象を切り替える
      const headerProps=
        pickViewMode==="card"
          ?{current:pickIdx+1,total:pickItems.length,onPrev:()=>setPickIdx(i=>i-1),onNext:()=>setPickIdx(i=>i+1),canPrev:pickIdx>0,canNext:pickIdx<pickItems.length-1}
          :pickViewMode==="group"
            ?{current:groupIdx+1,total:pickGroups.length,onPrev:()=>setGroupIdx(i=>i-1),onNext:()=>setGroupIdx(i=>i+1),canPrev:groupIdx>0,canNext:groupIdx<pickGroups.length-1}
            :{current:pickChecked,total:pickItems.length,onPrev:undefined,onNext:undefined,canPrev:false,canNext:false};
      return<>
        <ProgressHeader {...headerProps} checked={pickChecked} carrier={carrier} onBack={goToHome}/>
        <ViewToggle mode={pickViewMode} onChange={setPickViewMode}/>

        {/* ── カードモード ── */}
        {pickViewMode==="card"&&(()=>{
          const gi=pickItems.filter(p=>p.code===it.code);
          const gp=gi.findIndex(p=>p.id===it.id)+1;
          const prev=pickIdx>0?pickItems[pickIdx-1]:null;
          const ng=!prev||prev.code!==it.code;
          const col=findColorAttr(it);
          return<>
            <div className="mx-5 mt-3 flex items-center gap-3 px-5 py-4 rounded" style={{background:ng?"rgba(0,250,39,0.12)":S.s2,border:`1px solid ${ng?"rgba(0,250,39,0.3)":S.bd}`}}>
              <p className="font-[Roboto] font-black text-[22px] tracking-[-0.3px]" style={{color:S.green}}>{it.code}</p>
              <p className="font-[Roboto] font-extrabold text-[17px]" style={{color:S.grey}}>{gp}/{gi.length}</p>
              <p className="flex-1 text-right text-[13px] truncate" style={{color:S.grey}}>{it.name.substring(0,25)}</p>
            </div>
            <div className="flex-1 flex flex-col gap-4 p-5">
              <div className="flex flex-col justify-center rounded min-h-[280px] p-7 transition-all duration-300" style={{background:S.s1,border:`2px solid ${done?S.green:S.bd}`,transitionTimingFunction:S.ease}}>
                <div className="flex items-center gap-2">
                  <p className="font-[Roboto] font-black text-[32px] tracking-[-0.5px]" style={{color:S.green}}>{it.code}</p>
                  <a href={getProductUrlForPicking(it.code,it.name)} target="_blank" rel="noopener noreferrer" className="shrink-0 p-2 rounded transition-all active:scale-90" style={{background:S.s2,border:`1px solid ${S.bd}`}} onClick={e=>e.stopPropagation()}>{Ic.link(20,"#7e8085")}</a>
                </div>
                <p className="text-[16px] leading-[1.35] mt-2" style={{color:S.dim}}>{it.name}</p>
                <div className="flex flex-col gap-2 mt-5">
                  {col
                    ?<>
                      <ColorChip sw={col.sw} label={col.attr} size={26} textSize={28}/>
                      {col.other&&<p className="text-[26px] tracking-[-0.3px]" style={{color:S.green}}>{col.other}</p>}
                    </>
                    :<>
                      {it.attr1&&<p className="text-[26px] tracking-[-0.3px]">{it.attr1}</p>}
                      {it.attr2&&<p className="text-[26px] tracking-[-0.3px]">{it.attr2}</p>}
                    </>}
                </div>
                <div className="mt-7 text-center shrink-0">
                  <p className="font-[Roboto] font-black text-[72px] leading-none tracking-[-3px]" style={{color:it.qty>=2?S.green:S.white}}>×{it.qty}</p>
                  {it.setSize>0
                    ?<p className="font-[Roboto] font-extrabold text-[14px] mt-1.5" style={{color:S.grey}}>{it.setSize}枚セット × {it.qty/it.setSize}セット = {it.qty}枚</p>
                    :<p className="font-[Roboto] font-extrabold text-[11px] mt-1.5 tracking-[0.14em] uppercase" style={{color:S.grey}}>Picking Qty</p>}
                </div>
              </div>
            </div>
            <div className="px-5 pb-6">
              <CheckButton done={done} label="ピッキング完了" onClick={()=>togglePick(pickIdx)}/>
              {pickAllDone&&<DoneButton onClick={()=>setPhase("pickingSummary")} label="完了"/>}
            </div>
          </>;
        })()}

        {/* ── 一覧モード ── */}
        {pickViewMode==="list"&&<>
          <div className="flex-1 overflow-auto px-5 pt-3 pb-28">
            {pickItems.map((item,i)=>{
              const checked=pickChecks[i];
              const prevItem=i>0?pickItems[i-1]:null;
              const isNewGroup=!prevItem||prevItem.code!==item.code;
              const col=findColorAttr(item);
              return<div key={item.id}>
                {isNewGroup&&<div className="mt-5 mb-2 first:mt-0">
                  <p className="font-[Roboto] font-black text-[17px] tracking-[-0.2px] px-1" style={{color:S.green}}>{item.code}</p>
                  <p className="text-[12px] px-1 truncate" style={{color:S.grey}}>{item.name.substring(0,35)}</p>
                </div>}
                <button onClick={()=>togglePick(i)}
                  className="w-full flex items-center gap-3 px-4 py-4 rounded mb-2 cursor-pointer transition-all active:scale-[0.98] text-left min-h-[64px]"
                  style={{background:checked?S.s1:S.s2,border:`1px solid ${checked?S.green:S.bd}`}}>
                  <span className="shrink-0">{checked?Ic.chk(24,"#00fa27"):Ic.sq(24,S.grey)}</span>
                  <div className="flex-1 min-w-0">
                    {col
                      ?<span className="inline-flex items-center gap-2.5 flex-wrap" style={{opacity:checked?0.5:1}}>
                        <ColorChip sw={col.sw} label={col.attr} size={20} textSize={19}/>
                        {col.other&&<span className="text-[19px]" style={{color:checked?S.grey:S.green}}>{col.other}</span>}
                      </span>
                      :<p className="text-[19px] truncate" style={{color:checked?S.grey:S.white}}>{[item.attr1,item.attr2].filter(Boolean).join(" / ")||"—"}</p>}
                  </div>
                  <p className="font-[Roboto] font-black text-[24px] shrink-0" style={{color:checked?S.grey:item.qty>=2?S.green:S.white}}>×{item.qty}</p>
                </button>
              </div>;
            })}
          </div>
          {pickAllDone&&<div className="fixed bottom-0 left-0 right-0 p-5 z-30" style={{background:S.black}}>
            <button onClick={()=>setPhase("pickingSummary")} className="w-full max-w-[780px] mx-auto flex items-center justify-center gap-2 py-5 rounded text-[16px] cursor-pointer transition-all active:scale-[0.97]" style={{background:S.green,color:S.black}}>ピッキング完了{Ic.aR(18,"#000")}</button>
          </div>}
        </>}

        {/* ── グループモード ── */}
        {pickViewMode==="group"&&pickGroups.length>0&&(()=>{
          const g=pickGroups[groupIdx];
          const gChecked=g.items.filter(x=>pickChecks[x.id]).length;
          const gAllDone=gChecked===g.items.length;
          return<>
            <div className="mx-5 mt-3 flex items-center gap-3 px-5 py-4 rounded"
              style={{background:gAllDone?"rgba(0,250,39,0.12)":S.s2,border:`1px solid ${gAllDone?"rgba(0,250,39,0.3)":S.bd}`}}>
              <p className="font-[Roboto] font-black text-[22px] tracking-[-0.3px]" style={{color:S.green}}>{g.code}</p>
              <p className="font-[Roboto] font-extrabold text-[17px]" style={{color:S.grey}}>{gChecked}/{g.items.length}</p>
              <p className="flex-1 text-right text-[12px]" style={{color:S.grey}}>グループ {groupIdx+1}/{pickGroups.length}</p>
            </div>
            <div className="flex-1 flex flex-col gap-2 p-5">
              <div className="rounded p-5 transition-all duration-300" style={{background:S.s1,border:`2px solid ${gAllDone?S.green:S.bd}`,transitionTimingFunction:S.ease}}>
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-[Roboto] font-black text-[28px] tracking-[-0.5px]" style={{color:S.green}}>{g.code}</p>
                  <a href={getProductUrlForPicking(g.code,g.name)} target="_blank" rel="noopener noreferrer" className="shrink-0 p-2 rounded transition-all active:scale-90" style={{background:S.s2,border:`1px solid ${S.bd}`}} onClick={e=>e.stopPropagation()}>{Ic.link(20,"#7e8085")}</a>
                </div>
                <p className="text-[14px] leading-[1.35] mb-4" style={{color:S.dim}}>{g.name}</p>
                {g.items.map(item=>{
                  const idx=item.id;const checked=pickChecks[idx];
                  const col=findColorAttr(item);
                  return<button key={idx} onClick={()=>togglePick(idx)}
                    className="w-full flex items-center gap-3 px-4 py-4 rounded mb-2 cursor-pointer transition-all active:scale-[0.98] text-left min-h-[68px]"
                    style={{background:checked?"transparent":S.s2,border:`1.5px solid ${checked?S.green:S.bd}`}}>
                    <span className="shrink-0">{checked?Ic.chk(26,"#00fa27"):Ic.sq(26,S.grey)}</span>
                    <div className="flex-1 min-w-0">
                      {col
                        ?<span className="inline-flex items-center gap-2.5 flex-wrap" style={{opacity:checked?0.5:1}}>
                          <ColorChip sw={col.sw} label={col.attr} size={22} textSize={21}/>
                          {col.other&&<span className="text-[21px]" style={{color:checked?S.grey:S.green}}>{col.other}</span>}
                        </span>
                        :<p className="text-[21px]" style={{color:checked?S.grey:S.white}}>{[item.attr1,item.attr2].filter(Boolean).join(" / ")||"—"}</p>}
                    </div>
                    <p className="font-[Roboto] font-black text-[26px] shrink-0" style={{color:checked?S.grey:item.qty>=2?S.green:S.white}}>×{item.qty}</p>
                    {item.setSize>0&&<p className="text-[11px] shrink-0" style={{color:S.grey}}>{item.setSize}枚セット×{item.qty/item.setSize}</p>}
                  </button>;
                })}
              </div>
            </div>
            {pickAllDone&&<div className="px-5 pb-6"><DoneButton onClick={()=>setPhase("pickingSummary")} label="ピッキング完了"/></div>}
          </>;
        })()}
      </>;
    })()}

    {/* ═══ PICKING SUMMARY ═══ */}
    {phase==="pickingSummary"&&<div className="flex-1 flex flex-col p-5">
      <div className="text-center pt-11 pb-9">
        <div className="flex justify-center mb-5">{Ic.chkC(52,"#00fa27")}</div>
        <p className="font-[Roboto] font-black text-[11px] tracking-[0.2em] uppercase" style={{color:S.green}}>Complete</p>
        <p className="text-[28px] tracking-[-0.8px] mt-2">ピッキング完了</p>
        <p className="font-[Roboto] font-black text-[64px] leading-none tracking-[-2.5px] mt-2" style={{color:S.green}}>{totalPickQty}<span className="text-[22px] tracking-normal">点</span></p>
      </div>
      <div className="rounded overflow-hidden" style={{background:S.s1,border:`1px solid ${S.bd}`}}>
        <SummaryRow label="配送業者" value={carrierLabel}/>
        <SummaryRow label="バリエーション" value={`${pickItems.length}種`}/>
        <SummaryRow label="ピッキング総数" value={`${totalPickQty}点`}/>
        <SummaryRow label="チェック済み" value={`${pickChecked} / ${pickItems.length}`} valueColor="#00fa27"/>
      </div>
      <div className="mt-auto pt-7 flex flex-col gap-3">
        {carrier!=="all"&&<button onClick={goToPacking} className="w-full flex items-center justify-center gap-2 py-5 rounded text-[16px] cursor-pointer transition-all active:scale-[0.97]" style={{background:S.green,color:S.black}}>梱包フェーズへ{Ic.aR(18,"#000")}</button>}
        <button onClick={()=>{setPhase("picking");}} className="w-full flex items-center justify-center gap-1.5 py-[18px] rounded text-[15px] cursor-pointer transition-all active:scale-[0.97]" style={{background:S.s2,border:`1px solid ${S.bd}`}}>{Ic.aL(18)}ピッキング画面に戻る</button>
        <button onClick={goToHome} className="w-full flex items-center justify-center gap-2 py-5 rounded text-[16px] cursor-pointer transition-all active:scale-[0.97]" style={{background:carrier==="all"?S.green:S.s2,color:carrier==="all"?S.black:S.white,border:carrier==="all"?"none":`1px solid ${S.bd}`}}>ホームに戻る{Ic.aR(18,carrier==="all"?"#000":"#fff")}</button>
      </div>
    </div>}

    {/* ═══ PACKING ═══ */}
    {phase==="packing"&&packOrders.length>0&&(()=>{
      const o=packOrders[packIdx],done=packChecks[packIdx];
      const showOki=!!o.okihai,showCau=needsCautionSheet(o);
      const okDone=okihaiChecks[packIdx],caDone=cautionChecks[packIdx];
      const sk=getStoreKey(o.shopName),sc=STORE_CONFIG[sk];
      const showFly=campaign[sk],flDone=flyerChecks[packIdx];
      const subOk=(!showOki||okDone)&&(!showCau||caDone)&&(!showFly||flDone);
      return<>
      <ProgressHeader current={packIdx+1} total={packOrders.length} checked={packChecked} carrier={carrier} onBack={goToHome}
        onPrev={()=>setPackIdx(i=>i-1)} onNext={()=>setPackIdx(i=>i+1)} canPrev={packIdx>0} canNext={packIdx<packOrders.length-1}/>
      <div className="flex-1 flex flex-col gap-3 p-5">
        {/* 店舗バッジ */}
        <div className="flex items-center gap-2.5 px-4 py-3.5 rounded" style={{background:`${sc.color}18`,border:`1px solid ${sc.color}44`}}>
          <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{background:sc.color}}/>
          <p className="font-[Roboto] font-extrabold text-[17px]" style={{color:sc.color}}>{sc.label}</p>
          <p className="text-[13px]" style={{color:S.grey}}>{o.shopName}</p>
        </div>

        {showOki&&<CheckStrip icon={Ic.pin(20,okDone?"#00fa27":"#f5a623")} color={S.amber} borderColor={S.amber} checked={okDone} onToggle={()=>toggleOkihaiCheck(packIdx)} highlight={highlightMissing&&!okDone}>置き配シール貼付済み（{o.okihai}）</CheckStrip>}
        {showCau&&<CheckStrip icon={Ic.warn(20,caDone?"#00fa27":"#e4250e")} color={S.red} borderColor={S.red} checked={caDone} onToggle={()=>toggleCautionCheck(packIdx)} highlight={highlightMissing&&!caDone}>『サンダル保管について』封入済み</CheckStrip>}
        {showFly&&<CheckStrip icon={Ic.file(20,flDone?"#00fa27":sc.color)} color={sc.color} borderColor={sc.color} checked={flDone} onToggle={()=>toggleFlyerCheck(packIdx)} highlight={highlightMissing&&!flDone}>{sc.label}チラシ同封済み</CheckStrip>}
        {o.deliveryDate&&<AlertStrip icon={Ic.cal(20,"#00fa27")} color={S.green} borderColor="#00aa14">配送希望日：{o.deliveryDate}</AlertStrip>}

        {/* 注文カード */}
        <div className="rounded p-6 transition-all duration-300" style={{background:S.s1,border:`2px solid ${done?S.green:S.bd}`,borderLeft:`4px solid ${done?S.green:sc.color}`,transitionTimingFunction:S.ease}}>
          <p className="font-[Roboto] text-[13px]" style={{color:S.grey}}>No. {o.mgmtNo}</p>
          <p className="font-[Roboto] font-extrabold text-[11px] tracking-[0.14em] uppercase mt-5 mb-2 pb-2" style={{color:S.grey,borderBottom:`1px solid ${S.bd}`}}>SHIP TO</p>
          <p className="text-[26px] tracking-[-0.5px]">{o.recipientName}<span className="text-[17px] ml-1" style={{color:S.grey}}>様</span></p>
          <p className="text-[16px] leading-[1.6] mt-1.5" style={{color:S.dim}}>〒{o.recipientPostal}<br/>{o.recipientAddr}</p>
          {o.recipientTel&&<p className="text-[14px] mt-1" style={{color:S.grey}}>TEL {o.recipientTel}</p>}
          <p className="font-[Roboto] font-extrabold text-[11px] tracking-[0.14em] uppercase mt-6 mb-3 pb-2" style={{color:S.grey,borderBottom:`1px solid ${S.bd}`}}>ITEMS</p>

          {o.products.map((p,pi)=>{
            const col=findColorAttr(p);
            const pa=[p.attr1,p.attr2].filter(Boolean).join(" / ");
            const pu=getProductUrl(p.code,o.shopName,p.name);
            const showConfirm=col&&COLOR_CONFIRM_CODES.includes(p.code);
            return<div key={pi} className="flex flex-col rounded mb-2.5 overflow-hidden" style={{background:S.s2,border:`1px solid ${S.bd}`}}>
              <div className="flex items-center gap-3 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-[Roboto] font-black text-[26px] tracking-[-0.3px]" style={{color:S.green}}>{o.products.length>1?`${pi+1}. `:""}{p.code}</p>
                    {pu&&<a href={pu} target="_blank" rel="noopener noreferrer" className="shrink-0 p-1.5 rounded transition-all active:scale-90" style={{background:S.s1,border:`1px solid ${S.bd}`}} onClick={e=>e.stopPropagation()}>{Ic.link(18,"#7e8085")}</a>}
                  </div>
                  <p className="text-[15px] leading-[1.35] mt-1" style={{color:S.dim}}>{p.name}</p>
                  {isSwimwear(p)&&<div className="mt-1.5"><SwimwearBadge code={p.code}/></div>}
                  {col
                    ?<div className="flex items-center gap-3 mt-2.5 flex-wrap">
                      <ColorChip sw={col.sw} label={col.attr} size={24} textSize={26}/>
                      {col.other&&<p className="text-[24px]" style={{color:S.green}}>{col.other}</p>}
                    </div>
                    :pa&&<p className="text-[24px] mt-2" style={{color:S.green}}>{pa}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-[Roboto] font-black text-[34px] tracking-[-0.5px]" style={{color:p.qty>=2?S.green:S.white}}>×{p.qty}</p>
                  {p.setSize>0&&<p className="text-[12px] mt-0.5" style={{color:S.grey}}>{p.setSize}枚セット×{p.qty/p.setSize}</p>}
                </div>
              </div>
              {showConfirm&&col&&<div className="px-4 py-2.5 flex items-center gap-2 text-[14px]" style={{background:`${col.sw.dot}22`,borderTop:`1px solid ${col.sw.dot}55`}}>
                <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{background:col.sw.dot,border:col.sw.ring?"1px solid rgba(255,255,255,0.7)":"none"}}/>
                <span style={{color:col.sw.text}}>カラー確認：{col.attr}</span>
              </div>}
            </div>;
          })}
          <div className="text-center text-[16px] mt-3 py-3 rounded" style={{border:`1px solid ${S.bd}`}}>商品合計 <span className="font-[Roboto] font-black text-[22px] tracking-[-0.3px]">{o.totalItems}</span> 点</div>
        </div>
      </div>
      <div className="px-5 pb-6">
        <CheckButton done={done} label={!subOk?"先にチェック項目を完了してください":"梱包完了"} onClick={()=>handlePackComplete(packIdx)} disabled={!subOk&&!done}/>
        {packAllDone&&<DoneButton onClick={()=>setPhase("packingSummary")} label="完了"/>}
      </div>
    </>;})()}

    {/* ═══ PACKING SUMMARY ═══ */}
    {phase==="packingSummary"&&<div className="flex-1 flex flex-col p-5">
      <div className="text-center pt-11 pb-9">
        <div className="flex justify-center mb-5">{Ic.trophy(52,"#00fa27")}</div>
        <p className="font-[Roboto] font-black text-[11px] tracking-[0.2em] uppercase" style={{color:S.green}}>Complete</p>
        <p className="text-[28px] tracking-[-0.8px] mt-2">梱包完了</p>
        <p className="font-[Roboto] font-black text-[64px] leading-none tracking-[-2.5px] mt-2" style={{color:S.green}}>{packOrders.length}<span className="text-[22px] tracking-normal">件</span></p>
      </div>
      <div className="rounded overflow-hidden" style={{background:S.s1,border:`1px solid ${S.bd}`}}>
        <SummaryRow label="配送業者" value={carrierLabel}/>
        <SummaryRow label="受注件数" value={`${packOrders.length}件`}/>
        <SummaryRow label="商品総数" value={`${packOrders.reduce((s,o)=>s+o.totalItems,0)}点`}/>
        <SummaryRow label="配送希望日あり" value={`${packOrders.filter(o=>o.deliveryDate).length}件`}/>
        <SummaryRow label="置き配指定あり" value={`${packOrders.filter(o=>o.okihai).length}件`}/>
      </div>
      <div className="mt-auto pt-7 flex flex-col gap-3">
        <button onClick={()=>{setPhase("packing");}} className="w-full flex items-center justify-center gap-1.5 py-[18px] rounded text-[15px] cursor-pointer transition-all active:scale-[0.97]" style={{background:S.s2,border:`1px solid ${S.bd}`}}>{Ic.aL(18)}梱包画面に戻る</button>
        <button onClick={goToHome} className="w-full flex items-center justify-center gap-2 py-5 rounded text-[16px] cursor-pointer transition-all active:scale-[0.97]" style={{background:S.green,color:S.black}}>次の配送業者へ{Ic.aR(18,"#000")}</button>
        <button onClick={resetAll} className="w-full flex items-center justify-center gap-1.5 py-[18px] rounded text-[15px] cursor-pointer transition-all active:scale-[0.97]" style={{background:S.s2,border:`1px solid ${S.bd}`}}>作業終了（データクリア）</button>
      </div>
    </div>}

    {/* ═══ フローティング商品一覧 ═══ */}
    <button onClick={()=>setShowCatalog(true)} className="fixed bottom-6 right-6 w-[56px] h-[56px] rounded-full flex items-center justify-center cursor-pointer transition-all active:scale-90 z-40 shadow-lg" style={{background:S.s2,border:`2px solid ${S.bd}`}}>
      <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#7e8085" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
    </button>
    {showCatalog&&<div className="fixed inset-0 z-50 flex flex-col" style={{background:"rgba(0,0,0,0.95)"}} onClick={()=>setShowCatalog(false)}>
      <div className="flex items-center justify-between px-5 py-4 shrink-0"><p className="text-[15px]" style={{color:S.green}}>商品一覧（タップで閉じる）</p><button onClick={()=>setShowCatalog(false)} className="text-[28px] leading-none cursor-pointer bg-transparent border-none" style={{color:S.grey}}>✕</button></div>
      <div className="flex-1 overflow-auto p-2" onClick={e=>e.stopPropagation()}><img src="/daichu-packing-support/product-catalog.png" alt="商品一覧" className="w-full h-auto" style={{maxWidth:"100%",touchAction:"pinch-zoom"}}/></div>
    </div>}
  </div>);
}