// src/App.tsx
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DAICHU 梱包作業支援ツール v2
// 注文詳細CSV 1ファイル → ピッキング + 梱包
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { useState, useEffect, useCallback, useRef } from "react";
import { parseOrderCSV } from "./parsers";
import type { PickingItem, Product, Order, ParsedData, CarrierData } from "./parsers";

// ━━━ App固有の型 ━━━
type Phase = "home" | "picking" | "pickingSummary" | "packing" | "packingSummary";
type Carrier = "" | "sagawa" | "yamato";

// ━━━ localStorage 永続化 ━━━
const LS_KEY = "daichu-packing-v2";

type SavedState = {
  parsedData: ParsedData;
  carrier: Carrier;
  phase: Phase;
  pickIdx: number;
  packIdx: number;
  pickChecks: boolean[];
  packChecks: boolean[];
  okihaiChecks: boolean[];
  cautionChecks: boolean[];
};

function saveState(s: SavedState) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) { console.warn("[LS] 保存失敗:", e); }
}
function loadState(): SavedState | null {
  try { const raw = localStorage.getItem(LS_KEY); return raw ? (JSON.parse(raw) as SavedState) : null; } catch { return null; }
}
function clearState() {
  try { localStorage.removeItem(LS_KEY); } catch {}
}

// ━━━ 梱包チェック用の定数・ヘルパー ━━━
const CAUTION_SANDAL_PREFIXES = ["sandal-004", "sandal-007", "sandal-008"];
const isCautionSandal = (code: string): boolean => CAUTION_SANDAL_PREFIXES.some((p) => code.startsWith(p));
const needsCautionSheet = (o: Order): boolean => o.products.some((p) => isCautionSandal(p.code));

const COLOR_EMPHASIS_CODES = ["pet-008", "apron-001"];
const needsColorEmphasis = (p: Product): boolean => COLOR_EMPHASIS_CODES.includes(p.code);

const COLOR_SWATCHES: Record<string, string> = {
  "ライトブルー": "#87CEEB", "lblue": "#87CEEB", "ブルー": "#2563EB", "blue": "#2563EB",
  "ピンク": "#F472B6", "pink": "#F472B6", "グレー": "#9CA3AF", "gray": "#9CA3AF",
  "ブラウン": "#92400E", "brown": "#92400E", "ブラック": "#52525B", "black": "#52525B",
  "インディゴ": "#4338CA", "indigo": "#4338CA", "ネイビー": "#1E3A5F", "navy": "#1E3A5F",
  "ホワイト": "#D1D5DB", "white": "#D1D5DB",
};
const getSwatchColor = (text: string): string | null => {
  if (COLOR_SWATCHES[text]) return COLOR_SWATCHES[text];
  for (const [key, val] of Object.entries(COLOR_SWATCHES)) { if (text.includes(key)) return val; }
  return null;
};

const SWIMWEAR_LABELS: Record<string, string> = {
  "ladiesfashion-002": "ビキニ・セパレート", "ladiesfashion-010": "ワンピース無地 (na002)", "ladiesfashion-013": "ワンピース花柄 (na004)",
};
const isSwimwear = (p: Product): boolean => p.code in SWIMWEAR_LABELS;

// ━━━ SVGアイコン ━━━
const Ic = {
  truck: (s=24,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
  cat: (s=24,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5c-1.5-2.5-5-3-6-1s0 4 1 5c-1.5 1-2 3-2 5 0 3 2.5 5 7 5s7-2 7-5c0-2-.5-4-2-5 1-1 2-3 1-5s-4.5-1.5-6 1z"/><path d="M10 14h.01M14 14h.01M10 17c.5.5 1.5 1 2 1s1.5-.5 2-1"/></svg>,
  pkg: (s=24,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>,
  clip: (s=24,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 14l2 2 4-4"/></svg>,
  up: (s=24,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>,
  chk: (s=24,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>,
  chkC: (s=24,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>,
  sq: (s=24,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>,
  aL: (s=24,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>,
  aR: (s=24,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>,
  warn: (s=24,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  pin: (s=24,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  cal: (s=24,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  file: (s=24,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  trophy: (s=24,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22h10c0-2-.85-3.25-2.03-3.79A1.07 1.07 0 0114 17v-2.34"/><path d="M18 2H6v7a6 6 0 1012 0V2z"/></svg>,
};

// ━━━ 共通スタイル ━━━
const S = { green:"var(--green)",black:"var(--black)",white:"var(--white)",grey:"var(--grey)",dim:"var(--dim)",s1:"var(--s1)",s2:"var(--s2)",s3:"var(--s3)",bd:"var(--border)",red:"var(--red)",amber:"var(--amber)",ease:"var(--ease)" };

// ━━━ 小コンポーネント ━━━
function ProgressHeader({current,total,checked,carrier,onBack}:{current:number;total:number;checked:number;carrier:Carrier;onBack:()=>void}) {
  const label = carrier==="sagawa"?"佐川急便":"ヤマト運輸";
  return <div className="flex flex-col gap-3.5 px-5 pt-4"><div className="flex items-center justify-between"><p className="font-[Roboto] font-extrabold text-[13px] tracking-[0.04em]" style={{color:S.grey}}><span className="text-[22px] tracking-[-0.5px]" style={{color:S.white}}>{current}</span>{" / "}{total}<span className="ml-2" style={{color:S.green}}>({checked})</span></p><span className="font-[Roboto] font-extrabold text-[11px] tracking-[0.08em] uppercase px-3.5 py-[5px] rounded-full" style={{background:carrier==="sagawa"?S.green:S.white,color:S.black}}>{label}</span><button onClick={onBack} className="flex items-center gap-1 text-xs cursor-pointer bg-transparent border-none" style={{color:S.grey}}>{Ic.aL(14,"#7e8085")}戻る</button></div><div className="h-[3px] overflow-hidden" style={{background:S.s3}}><div className="h-full transition-[width] duration-400" style={{background:S.green,width:`${(checked/total)*100}%`,transitionTimingFunction:S.ease}}/></div></div>;
}
function NavButtons({idx,total,allDone,onPrev,onNext,onComplete}:{idx:number;total:number;allDone:boolean;onPrev:()=>void;onNext:()=>void;onComplete:()=>void}) {
  return <div className="flex gap-3 mt-3.5"><button disabled={idx===0} onClick={onPrev} className="flex-1 flex items-center justify-center gap-1.5 py-[18px] rounded text-[15px] cursor-pointer transition-all active:scale-[0.97] disabled:opacity-20 disabled:cursor-default" style={{background:S.s2,border:`1px solid ${S.bd}`}}>{Ic.aL(18)}前へ</button>{allDone?<button onClick={onComplete} className="flex-1 flex items-center justify-center gap-1.5 py-[18px] rounded text-[15px] cursor-pointer transition-all active:scale-[0.97]" style={{background:S.green,border:`1px solid ${S.green}`,color:S.black}}>完了{Ic.aR(18,"#000")}</button>:<button disabled={idx===total-1} onClick={onNext} className="flex-1 flex items-center justify-center gap-1.5 py-[18px] rounded text-[15px] cursor-pointer transition-all active:scale-[0.97] disabled:opacity-20 disabled:cursor-default" style={{background:S.s2,border:`1px solid ${S.bd}`}}>次へ{Ic.aR(18)}</button>}</div>;
}
function CheckButton({done,label,onClick,disabled}:{done:boolean;label:string;onClick:()=>void;disabled?:boolean}) {
  return <button onClick={onClick} disabled={disabled} className="w-full flex items-center justify-center gap-2.5 py-[22px] rounded text-base cursor-pointer transition-all active:scale-[0.97] disabled:cursor-default" style={{border:`2px solid ${done?S.green:S.bd}`,background:done?S.green:"transparent",color:done?S.black:S.white,opacity:disabled?0.35:1,transitionTimingFunction:S.ease}}>{done?Ic.chk(20,"#000"):Ic.sq(20,"#fff")}{label}</button>;
}
function AlertStrip({icon,color,borderColor,children}:{icon:React.ReactNode;color:string;borderColor:string;children:React.ReactNode}) {
  return <div className="flex items-center gap-2.5 px-4 py-3 text-sm tracking-[-0.02em]" style={{background:S.s2,borderLeft:`3px solid ${borderColor}`,color}}>{icon}{children}</div>;
}
function CheckStrip({icon,color,borderColor,checked,onToggle,highlight,children}:{icon:React.ReactNode;color:string;borderColor:string;checked:boolean;onToggle:()=>void;highlight?:boolean;children:React.ReactNode}) {
  return <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-4 text-[15px] tracking-[-0.02em] text-left cursor-pointer transition-all min-h-[56px]" style={{background:checked?S.s1:S.s2,borderLeft:`3px solid ${checked?"#00fa27":borderColor}`,borderTop:"none",borderRight:"none",borderBottom:"none",color:checked?S.green:color,animation:highlight?"pulse-warn 0.6s ease":undefined}}><span className="shrink-0 flex items-center justify-center w-[32px] h-[32px] transition-all" style={{opacity:checked?1:0.7}}>{checked?Ic.chk(24,"#00fa27"):Ic.sq(24,color)}</span><span className="shrink-0">{icon}</span><span className="flex-1">{children}</span></button>;
}
function SummaryRow({label,value,valueColor}:{label:string;value:string;valueColor?:string}) {
  return <div className="flex justify-between items-center px-5 py-3.5 text-sm" style={{borderBottom:`1px solid ${S.bd}`}}><span style={{color:S.grey}}>{label}</span><span style={{color:valueColor||S.white}}>{value}</span></div>;
}
function SwimwearBadge({code}:{code:string}) {
  const label=SWIMWEAR_LABELS[code]; if(!label) return null;
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-[Roboto] font-extrabold tracking-[0.04em]" style={{background:"#1e3a5f",color:"#60a5fa",border:"1px solid #2563EB44"}}>{label}</span>;
}

// ━━━ App ━━━
export default function App() {
  const saved = useRef(loadState());
  const [parsedData, setParsedData] = useState<ParsedData | null>(saved.current?.parsedData ?? null);
  const [phase, setPhase] = useState<Phase>(saved.current?.phase ?? "home");
  const [carrier, setCarrier] = useState<Carrier>(saved.current?.carrier ?? "");
  const [err, setErr] = useState("");
  const [uploading, setUploading] = useState(false);

  const cd: CarrierData | null = parsedData ? carrier==="sagawa"?parsedData.sagawa:carrier==="yamato"?parsedData.yamato:null : null;
  const pickItems = cd?.pickingItems ?? [];
  const packOrders = cd?.orders ?? [];

  const [pickIdx, setPickIdx] = useState(saved.current?.pickIdx ?? 0);
  const [packIdx, setPackIdx] = useState(saved.current?.packIdx ?? 0);
  const [pickChecks, setPickChecks] = useState<boolean[]>(saved.current?.pickChecks ?? []);
  const [packChecks, setPackChecks] = useState<boolean[]>(saved.current?.packChecks ?? []);
  const [okihaiChecks, setOkihaiChecks] = useState<boolean[]>(saved.current?.okihaiChecks ?? []);
  const [cautionChecks, setCautionChecks] = useState<boolean[]>(saved.current?.cautionChecks ?? []);
  const [highlightMissing, setHighlightMissing] = useState(false);

  useEffect(() => { if(!parsedData) return; saveState({parsedData,carrier,phase,pickIdx,packIdx,pickChecks,packChecks,okihaiChecks,cautionChecks}); }, [parsedData,carrier,phase,pickIdx,packIdx,pickChecks,packChecks,okihaiChecks,cautionChecks]);
  useEffect(() => { window.scrollTo({top:0,behavior:"instant"}); }, [pickIdx,packIdx,phase]);

  const handleCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if(!file) return;
    setErr(""); setUploading(true);
    try {
      const data = await parseOrderCSV(file);
      if(data.sagawa.orders.length+data.yamato.orders.length===0) { setErr("注文データが見つかりません"); }
      else { setParsedData(data); setCarrier(""); setPhase("home"); }
    } catch(ex:unknown) { setErr("CSV解析エラー: "+(ex instanceof Error?ex.message:String(ex))); }
    setUploading(false);
  };

  const startPhase = (c: Carrier, targetPhase: "picking"|"packing") => {
    if(!parsedData||c==="") return;
    const d = c==="sagawa"?parsedData.sagawa:parsedData.yamato;
    setCarrier(c); setPickIdx(0); setPickChecks(new Array(d.pickingItems.length).fill(false));
    setPackIdx(0); setPackChecks(new Array(d.orders.length).fill(false));
    setOkihaiChecks(new Array(d.orders.length).fill(false)); setCautionChecks(new Array(d.orders.length).fill(false));
    setPhase(targetPhase);
  };

  const togglePick = useCallback((i:number) => { setPickChecks(prev=>{const n=[...prev];n[i]=!n[i];return n;}); }, []);
  const togglePack = useCallback((i:number) => { setPackChecks(prev=>{const n=[...prev];n[i]=!n[i];return n;}); }, []);
  const handlePackComplete = useCallback((idx:number) => {
    const o=packOrders[idx];
    if((!(!o.okihai||okihaiChecks[idx]))||(!(!needsCautionSheet(o)||cautionChecks[idx]))) { setHighlightMissing(true); setTimeout(()=>setHighlightMissing(false),700); return; }
    togglePack(idx);
  }, [packOrders,okihaiChecks,cautionChecks,togglePack]);
  const toggleOkihaiCheck = useCallback((i:number) => { setOkihaiChecks(prev=>{const n=[...prev];n[i]=!n[i];return n;}); }, []);
  const toggleCautionCheck = useCallback((i:number) => { setCautionChecks(prev=>{const n=[...prev];n[i]=!n[i];return n;}); }, []);

  const prevPickChecks = useRef<boolean[]>([]);
  useEffect(() => { const prev=prevPickChecks.current; const curr=pickChecks; if(prev.length!==curr.length){prevPickChecks.current=curr;return;} const j=curr.findIndex((c,i)=>c&&!prev[i]); prevPickChecks.current=curr; if(j<0||phase!=="picking") return; if(curr.every(Boolean)){setTimeout(()=>setPhase("pickingSummary"),400);} else if(j<curr.length-1){setTimeout(()=>setPickIdx(j+1),300);} }, [pickChecks,phase]);
  const prevPackChecks = useRef<boolean[]>([]);
  useEffect(() => { const prev=prevPackChecks.current; const curr=packChecks; if(prev.length!==curr.length){prevPackChecks.current=curr;return;} const j=curr.findIndex((c,i)=>c&&!prev[i]); prevPackChecks.current=curr; if(j<0||phase!=="packing") return; if(curr.every(Boolean)){setTimeout(()=>setPhase("packingSummary"),400);} else if(j<curr.length-1){setTimeout(()=>setPackIdx(j+1),300);} }, [packChecks,phase]);

  const resetAll = () => { clearState(); setParsedData(null); setPhase("home"); setCarrier(""); setErr(""); setPickChecks([]); setPickIdx(0); setPackChecks([]); setPackIdx(0); setOkihaiChecks([]); setCautionChecks([]); };
  const goToPacking = () => { setPackIdx(0); setPhase("packing"); };
  const goToHome = () => { setPhase("home"); setCarrier(""); setPickChecks([]); setPickIdx(0); setPackChecks([]); setPackIdx(0); setOkihaiChecks([]); setCautionChecks([]); };

  const pickChecked = pickChecks.filter(Boolean).length;
  const packChecked = packChecks.filter(Boolean).length;
  const totalPickQty = pickItems.reduce((s,r)=>s+r.qty,0);
  const pickAllDone = pickChecks.length>0&&pickChecks.every(Boolean);
  const packAllDone = packChecks.length>0&&packChecks.every(Boolean);
  const carrierLabel = carrier==="sagawa"?"佐川急便":"ヤマト運輸";

  return (
    <div className="max-w-[780px] mx-auto min-h-dvh flex flex-col">

      {phase === "home" && <>
        <div className="pt-10 px-5 text-center">
          <p className="font-[Roboto] font-black text-[11px] tracking-[0.2em] uppercase" style={{color:S.green}}>DAICHU TOOLS</p>
          <h1 className="font-[Roboto] font-black text-[42px] leading-[0.95] tracking-[-1.6px] mt-2.5">PACKING<br/><span style={{color:S.green}}>SUPPORT</span></h1>
          <p className="text-[13px] mt-3.5 tracking-[0.02em]" style={{color:S.grey}}>ピッキング・梱包作業支援ダッシュボード</p>
        </div>
        <div className="flex-1 flex flex-col gap-6 px-5 pt-9 pb-6">
          {err && <div className="flex items-center gap-2.5 px-4 py-3.5 text-sm" style={{background:S.s2,borderLeft:`3px solid ${S.red}`,color:S.red}}>{Ic.warn(18,"#e4250e")}{err}</div>}

          <div className="rounded overflow-hidden" style={{background:S.s1,border:`1px solid ${S.bd}`}}>
            <div className="flex items-center gap-3 px-5 py-4" style={{borderBottom:`1px solid ${S.bd}`}}>{Ic.file(18,"#00fa27")}<div><p className="font-[Roboto] font-extrabold text-[11px] tracking-[0.12em] uppercase" style={{color:S.green}}>STEP 1</p><p className="text-base tracking-[-0.02em]">注文詳細CSVを読み込む</p></div></div>
            <div className="p-5">
              <label className="block rounded text-center cursor-pointer relative py-9 px-5" style={{border:parsedData?`2px solid ${S.green}`:`2px dashed ${S.bd}`}}>
                <input type="file" accept=".csv" onChange={handleCSV} disabled={uploading} className="absolute inset-0 opacity-0 cursor-pointer"/>
                <div className="flex justify-center mb-3.5">{uploading?Ic.pkg(32,"#00fa27"):parsedData?Ic.chkC(32,"#00fa27"):Ic.up(32,"#7e8085")}</div>
                <p className="text-sm" style={{color:parsedData?S.green:S.grey}}>{uploading?"読み込み中...":parsedData?"読み込み完了（タップで再読み込み）":"CROSS MALL 注文詳細CSVをアップロード"}</p>
                {parsedData && <p className="text-xs mt-1.5" style={{color:S.grey}}>佐川 {parsedData.sagawa.orders.length}件 / ヤマト {parsedData.yamato.orders.length}件</p>}
              </label>
            </div>
          </div>

          {parsedData && (
            <div className="flex flex-col gap-4">
              {([["sagawa","佐川急便",parsedData.sagawa],["yamato","ヤマト運輸",parsedData.yamato]] as const).map(([key,label,data]) => (
                <div key={key} className="rounded overflow-hidden" style={{background:S.s1,border:`1px solid ${S.bd}`}}>
                  <div className="flex items-center gap-3 px-5 py-4" style={{borderBottom:`1px solid ${S.bd}`}}>{key==="sagawa"?Ic.truck(20,"#00fa27"):Ic.cat(20,"#fff")}<div><p className="text-[17px]">{label}</p><p className="text-[12px] mt-0.5" style={{color:S.grey}}>{data.orders.length}件</p></div></div>
                  <div className="p-4 flex gap-3">
                    <button onClick={()=>startPhase(key,"picking")} disabled={data.pickingItems.length===0} className="flex-1 flex flex-col items-center gap-1.5 py-5 rounded cursor-pointer transition-all active:scale-[0.97] disabled:opacity-30 disabled:cursor-default" style={{background:S.s2,border:`2px solid ${S.bd}`}}>{Ic.pkg(22,"#00fa27")}<p className="text-[15px]">ピッキング</p><p className="text-[12px]" style={{color:S.grey}}>{data.pickingItems.length}種 {data.totalPickingQty}点</p></button>
                    <button onClick={()=>startPhase(key,"packing")} disabled={data.orders.length===0} className="flex-1 flex flex-col items-center gap-1.5 py-5 rounded cursor-pointer transition-all active:scale-[0.97] disabled:opacity-30 disabled:cursor-default" style={{background:S.s2,border:`2px solid ${S.bd}`}}>{Ic.clip(22,"#00fa27")}<p className="text-[15px]">梱包</p><p className="text-[12px]" style={{color:S.grey}}>{data.orders.length}件</p></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </>}

      {phase === "picking" && pickItems.length > 0 && (() => {
        const it=pickItems[pickIdx], done=pickChecks[pickIdx];
        return <>
          <ProgressHeader current={pickIdx+1} total={pickItems.length} checked={pickChecked} carrier={carrier} onBack={goToHome}/>
          <div className="flex-1 flex flex-col gap-4 p-5">
            <div className="flex flex-col justify-center rounded min-h-[280px] p-7 transition-all duration-300" style={{background:S.s1,border:`2px solid ${done?S.green:S.bd}`,transitionTimingFunction:S.ease}}>
              <p className="font-[Roboto] font-black text-[28px] tracking-[-0.5px]" style={{color:S.green}}>{it.code}</p>
              <p className="text-[15px] leading-[1.3] mt-1.5" style={{color:S.dim}}>{it.name}</p>
              <div className="flex flex-col gap-1 mt-5">
                {it.attr1 && <p className="text-[22px] tracking-[-0.3px]">{it.attr1}</p>}
                {it.attr2 && <p className="text-[22px] tracking-[-0.3px]">{it.attr2}</p>}
              </div>
              <div className="mt-7 text-center shrink-0">
                <p className="font-[Roboto] font-black text-[72px] leading-none tracking-[-3px]" style={{color:it.qty>=2?S.green:S.white}}>×{it.qty}</p>
                {it.setSize > 0 ? (
                  <p className="font-[Roboto] font-extrabold text-[13px] mt-1.5 tracking-[0.02em]" style={{color:S.grey}}>{it.setSize}枚セット × {it.qty/it.setSize}セット = {it.qty}枚</p>
                ) : (
                  <p className="font-[Roboto] font-extrabold text-[11px] mt-1.5 tracking-[0.14em] uppercase" style={{color:S.grey}}>Picking Qty</p>
                )}
              </div>
            </div>
          </div>
          <div className="px-5 pb-6">
            <CheckButton done={done} label="ピッキング完了" onClick={()=>togglePick(pickIdx)}/>
            <NavButtons idx={pickIdx} total={pickItems.length} allDone={pickAllDone} onPrev={()=>setPickIdx(i=>i-1)} onNext={()=>setPickIdx(i=>i+1)} onComplete={()=>setPhase("pickingSummary")}/>
          </div>
        </>;
      })()}

      {phase === "pickingSummary" && (
        <div className="flex-1 flex flex-col p-5">
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
            <button onClick={goToPacking} className="w-full flex items-center justify-center gap-2 py-5 rounded text-[15px] cursor-pointer transition-all active:scale-[0.97]" style={{background:S.green,color:S.black}}>梱包フェーズへ{Ic.aR(18,"#000")}</button>
            <button onClick={()=>{setPickIdx(0);setPhase("picking");}} className="w-full flex items-center justify-center gap-1.5 py-[18px] rounded text-[15px] cursor-pointer transition-all active:scale-[0.97]" style={{background:S.s2,border:`1px solid ${S.bd}`}}>{Ic.aL(18)}ピッキングに戻る</button>
          </div>
        </div>
      )}

      {phase === "packing" && packOrders.length > 0 && (() => {
        const o=packOrders[packIdx], done=packChecks[packIdx];
        const showOkihaiCheck=!!o.okihai, showCautionCheck=needsCautionSheet(o);
        const okihaiDone=okihaiChecks[packIdx], cautionDone=cautionChecks[packIdx];
        const subChecksComplete=(!showOkihaiCheck||okihaiDone)&&(!showCautionCheck||cautionDone);
        return <>
          <ProgressHeader current={packIdx+1} total={packOrders.length} checked={packChecked} carrier={carrier} onBack={goToHome}/>
          <div className="flex-1 flex flex-col gap-3 p-5">
            {showOkihaiCheck && <CheckStrip icon={Ic.pin(18,okihaiDone?"#00fa27":"#f5a623")} color={S.amber} borderColor={S.amber} checked={okihaiDone} onToggle={()=>toggleOkihaiCheck(packIdx)} highlight={highlightMissing&&!okihaiDone}>置き配シール貼付済み（{o.okihai}）</CheckStrip>}
            {showCautionCheck && <CheckStrip icon={Ic.warn(18,cautionDone?"#00fa27":"#e4250e")} color={S.red} borderColor={S.red} checked={cautionDone} onToggle={()=>toggleCautionCheck(packIdx)} highlight={highlightMissing&&!cautionDone}>『サンダル保管について』封入済み</CheckStrip>}
            {o.deliveryDate && <AlertStrip icon={Ic.cal(18,"#00fa27")} color={S.green} borderColor="#00aa14">配送希望日：{o.deliveryDate}</AlertStrip>}

            <div className="rounded p-6 transition-all duration-300" style={{background:S.s1,border:`2px solid ${done?S.green:S.bd}`,transitionTimingFunction:S.ease}}>
              <p className="font-[Roboto] text-[13px] tracking-[0.02em]" style={{color:S.grey}}>No. {o.mgmtNo}</p>
              <p className="font-[Roboto] font-extrabold text-[11px] tracking-[0.14em] uppercase mt-5 mb-2 pb-2" style={{color:S.grey,borderBottom:`1px solid ${S.bd}`}}>SHIP TO</p>
              <p className="text-[24px] tracking-[-0.5px]">{o.recipientName}<span className="text-base ml-1" style={{color:S.grey}}>様</span></p>
              <p className="text-[15px] leading-[1.6] mt-1.5" style={{color:S.dim}}>〒{o.recipientPostal}<br/>{o.recipientAddr}</p>
              {o.recipientTel && <p className="text-[13px] mt-1" style={{color:S.grey}}>TEL {o.recipientTel}</p>}

              <p className="font-[Roboto] font-extrabold text-[11px] tracking-[0.14em] uppercase mt-6 mb-3 pb-2" style={{color:S.grey,borderBottom:`1px solid ${S.bd}`}}>ITEMS</p>
              {o.products.map((p,pi) => {
                const colorAttr=needsColorEmphasis(p)?(getSwatchColor(p.attr2)?p.attr2:getSwatchColor(p.attr1)?p.attr1:null):null;
                const swColor=colorAttr?getSwatchColor(colorAttr):null;
                const sizeAttr=swColor?(colorAttr===p.attr1?p.attr2:p.attr1):null;
                const plainAttrs=[p.attr1,p.attr2].filter(Boolean).join(" / ");
                return (
                  <div key={pi} className="flex flex-col rounded mb-2 overflow-hidden" style={{background:S.s2,border:`1px solid ${S.bd}`}}>
                    <div className="flex items-center gap-3 p-3.5">
                      <div className="flex-1 min-w-0">
                        <p className="font-[Roboto] font-black text-[20px] tracking-[-0.3px]" style={{color:S.green}}>{o.products.length>1?`${pi+1}. `:""}{p.code}</p>
                        <p className="text-[14px] leading-[1.3] mt-0.5" style={{color:S.dim}}>{p.name}</p>
                        {isSwimwear(p) && <div className="mt-1.5"><SwimwearBadge code={p.code}/></div>}
                        {swColor&&colorAttr ? (
                          <div className="flex items-center gap-2 mt-2">
                            <span className="inline-block w-[20px] h-[20px] rounded-full shrink-0" style={{background:swColor,border:"2px solid rgba(255,255,255,0.3)",boxShadow:`0 0 8px ${swColor}66`}}/>
                            <p className="text-[20px] tracking-[-0.3px] font-[Roboto] font-extrabold" style={{color:swColor}}>{colorAttr}</p>
                            {sizeAttr && <p className="text-[18px] ml-1" style={{color:S.green}}>{sizeAttr}</p>}
                          </div>
                        ) : (plainAttrs && <p className="text-[18px] mt-1.5" style={{color:S.green}}>{plainAttrs}</p>)}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-[Roboto] font-black text-[28px] tracking-[-0.5px]" style={{color:p.qty>=2?S.green:S.white}}>×{p.qty}</p>
                        {p.setSize > 0 && <p className="text-[11px] mt-0.5" style={{color:S.grey}}>{p.setSize}枚セット×{p.qty/p.setSize}</p>}
                      </div>
                    </div>
                    {swColor&&colorAttr && <div className="px-3.5 py-2 flex items-center gap-2 text-[13px]" style={{background:`${swColor}18`,borderTop:`1px solid ${swColor}44`}}><span className="w-3 h-3 rounded-full shrink-0" style={{background:swColor}}/><span style={{color:swColor}}>カラー確認：{colorAttr}</span></div>}
                  </div>
                );
              })}
              <div className="text-center text-[15px] mt-3 py-2.5 rounded" style={{border:`1px solid ${S.bd}`}}>商品合計 <span className="font-[Roboto] font-black text-xl tracking-[-0.3px]">{o.totalItems}</span> 点</div>
            </div>
          </div>
          <div className="px-5 pb-6">
            <CheckButton done={done} label={!subChecksComplete?"先にチェック項目を完了してください":"梱包完了"} onClick={()=>handlePackComplete(packIdx)} disabled={!subChecksComplete&&!done}/>
            <NavButtons idx={packIdx} total={packOrders.length} allDone={packAllDone} onPrev={()=>setPackIdx(i=>i-1)} onNext={()=>setPackIdx(i=>i+1)} onComplete={()=>setPhase("packingSummary")}/>
          </div>
        </>;
      })()}

      {phase === "packingSummary" && (
        <div className="flex-1 flex flex-col p-5">
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
            <button onClick={goToHome} className="w-full flex items-center justify-center gap-2 py-5 rounded text-[15px] cursor-pointer transition-all active:scale-[0.97]" style={{background:S.green,color:S.black}}>次の配送業者へ{Ic.aR(18,"#000")}</button>
            <button onClick={resetAll} className="w-full flex items-center justify-center gap-1.5 py-[18px] rounded text-[15px] cursor-pointer transition-all active:scale-[0.97]" style={{background:S.s2,border:`1px solid ${S.bd}`}}>作業終了（データクリア）</button>
          </div>
        </div>
      )}
    </div>
  );
}