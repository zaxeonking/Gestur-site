import React, { useEffect, useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import {
  Activity, AlertTriangle, ArrowDownToLine, ArrowLeftRight, Check, CheckCheck,
  ChevronDown, Clipboard, Code2, FileCode2, Fingerprint, History, Info,
  LockKeyhole, Menu, ScanSearch, Settings2, Shield, ShieldCheck, Sparkles,
  Trash2, WandSparkles, X, Zap
} from 'lucide-react'

const STARTER = `// Welcome to CodeShield\n// Paste code here, then run a scan.\n\nfunction greet(name) {\n  return \`Hello, \${name}!\`;\n}\n\nconsole.log(greet('developer'));\n`
const ZERO_WIDTH = new Set([0x00AD, 0x034F, 0x061C, 0x115F, 0x1160, 0x17B4, 0x17B5, 0x180E, 0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2060, 0x2061, 0x2062, 0x2063, 0x2064, 0x2066, 0x2067, 0x2068, 0x2069, 0xFEFF])
const INVISIBLE_NAMES = {
  0x00AD: 'Soft hyphen', 0x034F: 'Combining grapheme joiner', 0x061C: 'Arabic letter mark', 0x115F: 'Hangul choseong filler', 0x1160: 'Hangul jungseong filler', 0x17B4: 'Khmer vowel inherent AQ', 0x17B5: 'Khmer vowel inherent AA', 0x180E: 'Mongolian vowel separator', 0x200B: 'Zero-width space', 0x200C: 'Zero-width non-joiner', 0x200D: 'Zero-width joiner', 0x200E: 'Left-to-right mark', 0x200F: 'Right-to-left mark', 0x202A: 'Left-to-right embedding', 0x202B: 'Right-to-left embedding', 0x202C: 'Pop directional formatting', 0x202D: 'Left-to-right override', 0x202E: 'Right-to-left override', 0x2060: 'Word joiner', 0x2061: 'Function application', 0x2062: 'Invisible times', 0x2063: 'Invisible separator', 0x2064: 'Invisible plus', 0x2066: 'Left-to-right isolate', 0x2067: 'Right-to-left isolate', 0x2068: 'First strong isolate', 0x2069: 'Pop directional isolate', 0xFEFF: 'Zero-width no-break space / BOM'
}
const fmt = n => String(n).padStart(2, '0')
function scanText(text) {
  const found = []
  let line = 1, col = 1, offset = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0)
    const category = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(ch) && ch !== '\n' && ch !== '\r' && ch !== '\t' ? 'control' : null
    const suspicious = ZERO_WIDTH.has(cp) || category
    if (suspicious) found.push({ id: `${offset}-${cp}`, char: ch, cp, line, col, offset, name: INVISIBLE_NAMES[cp] || (category ? 'Unicode format/control character' : 'Unusual character'), hex: `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`, category: ZERO_WIDTH.has(cp) ? 'zero' : 'control' })
    if (ch === '\n') { line++; col = 1 } else col++
    offset += ch.length
  }
  // Confusable-lookalike checks are advisory only; Unicode script coverage is intentionally broad.
  const confusables = []
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (/[\u0400-\u04FF\u0370-\u03FF]/u.test(ch) && /[A-Za-z]/.test(text[i - 1] || '') && /[A-Za-z]/.test(text[i + 1] || '')) {
      confusables.push({ id: `c-${i}-${ch.codePointAt(0)}`, char: ch, cp: ch.codePointAt(0), line: text.slice(0, i).split('\n').length, col: i - text.lastIndexOf('\n', i - 1), offset: i, name: 'Non-Latin character inside Latin-looking text', hex: `U+${ch.codePointAt(0).toString(16).toUpperCase()}`, category: 'confusable' })
    }
  }
  return [...found, ...confusables].sort((a, b) => a.offset - b.offset)
}
function languageFromText(text) {
  if (/\b(const|let|function|=>|console\.log)\b/.test(text)) return 'javascript'
  if (/<[A-Za-z][^>]*>/.test(text)) return 'html'
  if (/\b(def|import|print|elif)\b/.test(text)) return 'python'
  if (/\b(public|class|static|void)\b/.test(text)) return 'java'
  if (/^\s*[\w-]+\s*:/m.test(text) && text.includes('\n')) return 'yaml'
  return 'plaintext'
}
function cleanText(text, selected, options) {
  let output = '', removed = [], line = 1, col = 1, offset = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0)
    const isZero = ZERO_WIDTH.has(cp)
    const isControl = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(ch) && !['\n', '\r', '\t'].includes(ch)
    const isConfusable = /[\u0400-\u04FF\u0370-\u03FF]/u.test(ch)
    const remove = (selected.zero && isZero) || (selected.control && isControl && !isZero) || (selected.bom && cp === 0xFEFF) || (selected.confusable && isConfusable && options.removeConfusables)
    if (remove) removed.push({ char: ch, cp, line, col, offset, hex: `U+${cp.toString(16).toUpperCase().padStart(4, '0')}` })
    else output += ch
    if (ch === '\n') { line++; col = 1 } else col++
    offset += ch.length
  }
  return { output, removed }
}
const NAV = [
  { id: 'scanner', label: 'Scanner', icon: ScanSearch, desc: 'Inspect hidden characters' },
  { id: 'cleaner', label: 'Cleaner', icon: WandSparkles, desc: 'Review and clean safely' },
  { id: 'analyzer', label: 'Pattern analyzer', icon: Fingerprint, desc: 'Heuristic text signals' },
  { id: 'diff', label: 'Code diff', icon: ArrowLeftRight, desc: 'Compare changes' },
  { id: 'history', label: 'Scan history', icon: History, desc: 'Recent local sessions' },
]

export default function App() {
  const [active, setActive] = useState('scanner')
  const [code, setCode] = useState(STARTER)
  const [original, setOriginal] = useState(STARTER)
  const [results, setResults] = useState(null)
  const [cleaned, setCleaned] = useState(null)
  const [selected, setSelected] = useState({ zero: true, control: true, bom: true, confusable: true })
  const [removeConfusables, setRemoveConfusables] = useState(false)
  const [copied, setCopied] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [history, setHistory] = useState(() => { try { return JSON.parse(localStorage.getItem('codeshield-history') || '[]') } catch { return [] } })
  const [notice, setNotice] = useState('')
  const issues = useMemo(() => scanText(code), [code])
  const zeroCount = issues.filter(x => x.category === 'zero').length
  const controlCount = issues.filter(x => x.category === 'control').length
  const confusableCount = issues.filter(x => x.category === 'confusable').length
  const lineCount = code ? code.split('\n').length : 0
  const charCount = code.length
  const language = languageFromText(code)

  useEffect(() => { localStorage.setItem('codeshield-history', JSON.stringify(history.slice(0, 12))) }, [history])
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(''), 2800); return () => clearTimeout(t) }, [notice])

  const runScan = () => {
    const found = scanText(code)
    setResults({ count: found.length, at: new Date().toLocaleString(), items: found, source: code })
    setHistory(prev => [{ id: Date.now(), at: new Date().toLocaleString(), count: found.length, chars: code.length, preview: code.slice(0, 80) || '(empty code)' }, ...prev].slice(0, 12))
    setNotice(found.length ? `Scan complete · ${found.length} finding${found.length === 1 ? '' : 's'}` : 'Scan complete · no flagged characters')
  }
  const doClean = () => {
    const out = cleanText(code, selected, { removeConfusables })
    setCleaned({ output: out.output, removed: out.removed, before: code })
    setNotice(out.removed.length ? `${out.removed.length} character${out.removed.length === 1 ? '' : 's'} queued for review` : 'Nothing matched the selected cleanup rules')
    setActive('cleaner')
  }
  const applyClean = () => {
    if (!cleaned) return
    setOriginal(code); setCode(cleaned.output); setResults(null); setNotice('Cleaned version applied · original remains in diff view'); setActive('diff')
  }
  const copyText = async text => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setNotice('Copied to clipboard'); setTimeout(() => setCopied(false), 1600) }
    catch { setNotice('Clipboard unavailable — select and copy manually') }
  }
  const downloadText = () => {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'codeshield-cleaned.txt'; a.click(); URL.revokeObjectURL(url)
  }
  const setNav = id => { setActive(id); setMobileNav(false) }
  const editorOptions = { minimap: { enabled: false }, fontSize: 13, lineNumbers: 'on', scrollBeyondLastLine: false, automaticLayout: true, wordWrap: 'on', padding: { top: 16, bottom: 16 }, renderLineHighlight: 'all', smoothScrolling: true, cursorBlinking: 'smooth', glyphMargin: false, folding: true, tabSize: 2 }

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Shield size={22} strokeWidth={2.4}/><span className="brand-dot"/></div><div><div className="brand-name">Code<span>Shield</span></div><div className="brand-sub">DEVELOPER SUITE <span className="version">v1.0</span></div></div><button className="icon-button close-nav" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={17}/></button></div>
      <div className="workspace-label">WORKSPACE</div>
      <div className="workspace-card"><div className="workspace-icon"><Code2 size={17}/></div><div className="workspace-text"><b>Local workspace</b><span>Browser-only processing</span></div><span className="online-dot"/></div>
      <div className="nav-label">TOOLS</div>
      <nav className="nav-list">{NAV.map(item => { const Icon = item.icon; return <button key={item.id} className={`nav-item ${active === item.id ? 'active' : ''}`} onClick={() => setNav(item.id)}><Icon size={18}/><span>{item.label}</span>{item.id === 'scanner' && issues.length > 0 && <span className="nav-count">{issues.length}</span>}{active === item.id && <span className="nav-active-bar"/>}</button> })}</nav>
      <div className="sidebar-bottom"><div className="privacy-card"><div className="privacy-icon"><LockKeyhole size={16}/></div><div><b>Your code stays local</b><p>Analysis runs in this browser. No upload endpoint is configured.</p></div></div><button className="nav-item settings-item" onClick={() => setNotice('Settings: cleanup options are available in the Cleaner panel.')}><Settings2 size={18}/><span>Settings</span></button><div className="sidebar-foot"><span className="status-pulse"/> ALL SYSTEMS OPERATIONAL <span className="foot-version">1.0.0</span></div></div>
    </aside>
    {mobileNav && <button className="nav-backdrop" onClick={() => setMobileNav(false)} aria-label="Close navigation"/>}
    <main className="main-area">
      <header className="topbar"><div className="crumbs"><button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={19}/></button><span className="crumb-muted">Workspace</span><span className="crumb-slash">/</span><span className="crumb-current">{NAV.find(n => n.id === active)?.label || 'Scanner'}</span></div><div className="topbar-right"><span className="local-badge"><span/> LOCAL MODE</span><span className="topbar-divider"/><button className="help-button" onClick={() => setNotice('Tip: run a scan first, then review each finding before cleaning.')}><Info size={15}/> <span>Quick guide</span></button><div className="avatar">CS</div></div></header>
      <section className="page-content">
        <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> CODE INTEGRITY TOOLKIT</div><h1>{active === 'scanner' ? 'Inspect your code.' : active === 'cleaner' ? 'Clean with confidence.' : active === 'analyzer' ? 'Explore text patterns.' : active === 'diff' ? 'Review every change.' : 'Your local history.'}</h1><p className="page-subtitle">{active === 'scanner' ? 'Find invisible Unicode, control characters, and suspicious text signals.' : active === 'cleaner' ? 'Choose exactly what to remove. Nothing changes until you apply it.' : active === 'analyzer' ? 'Review lightweight heuristics — not a verdict on who or what wrote the code.' : active === 'diff' ? 'Compare your current code with the saved baseline and review the cleanup impact.' : 'Recent scans are stored in this browser only.'}</p></div><div className="heading-actions"><button className="btn btn-secondary" onClick={() => { setCode(''); setResults(null); setCleaned(null); setNotice('Editor cleared') }}><Trash2 size={15}/> Clear</button><button className="btn btn-primary" onClick={runScan}><ScanSearch size={16}/> Scan code <span className="shortcut">⌘ ↵</span></button></div></div>

        {active === 'scanner' && <>
          <div className="metric-grid"><Metric icon={ScanSearch} label="Findings" value={results ? results.count : '—'} hint={results ? (results.count ? 'Review recommended' : 'No flagged characters') : 'Run a scan to begin'} tone={results?.count ? 'warning' : 'blue'}/><Metric icon={Fingerprint} label="Invisible / format" value={results ? results.items.filter(x => x.category !== 'confusable').length : '—'} hint="Unicode format characters" tone="purple"/><Metric icon={AlertTriangle} label="Lookalike signals" value={results ? results.items.filter(x => x.category === 'confusable').length : '—'} hint="Heuristic, may be benign" tone="orange"/><Metric icon={FileCode2} label="Source size" value={charCount.toLocaleString()} hint={`${lineCount} lines · ${language}`} tone="green"/></div>
          <div className="editor-card"><div className="card-top"><div className="card-title"><div className="title-icon"><Code2 size={17}/></div><div><h2>Source editor</h2><p>Paste or type code to inspect</p></div></div><div className="editor-top-actions"><span className="language-pill"><span className="language-dot"/>{language}</span><button className="text-icon-button" onClick={() => copyText(code)}><Clipboard size={14}/><span>{copied ? 'Copied' : 'Copy'}</span></button></div></div><div className="editor-wrap"><Editor height="340px" language={language} theme="vs-dark" value={code} onChange={v => setCode(v ?? '')} options={editorOptions}/></div><div className="editor-footer"><div className="editor-status"><span className="status-dot"/> Ready <span className="status-sep">/</span> UTF-8</div><div className="editor-stats"><span>{charCount.toLocaleString()} chars</span><span>{lineCount} lines</span><span>Spaces: 2</span></div></div></div>
          <div className="bottom-grid"><div className="panel findings-panel"><div className="panel-heading"><div><h2><Activity size={17}/> Scan findings</h2><p>{results ? `Last scan: ${results.at}` : 'Run a scan to populate the report'}</p></div>{results && <span className={`result-pill ${results.count ? 'pill-warn' : 'pill-ok'}`}>{results.count ? `${results.count} flagged` : 'Clean scan'}</span>}</div>{!results ? <EmptyState icon={ScanSearch} title="Waiting for your first scan" text="Your findings will appear here, with exact line and column positions."/> : results.count === 0 ? <EmptyState icon={ShieldCheck} title="No flagged characters found" text="This scan did not find characters in the configured detection set. It cannot rule out every type of watermark."/> : <div className="finding-list">{results.items.slice(0, 8).map(item => <Finding key={item.id} item={item} onLocate={() => { setCode(results.source); setNotice(`Finding at line ${item.line}, column ${item.col} (${item.hex})`) }}/>) }{results.items.length > 8 && <div className="more-findings">+ {results.items.length - 8} more findings · open Cleaner to review cleanup options</div>}</div>}</div>
          <div className="panel quick-panel"><div className="panel-heading"><div><h2><Zap size={17}/> Quick actions</h2><p>Keep your workflow moving</p></div></div><button className="action-row" onClick={doClean}><div className="action-icon purple-bg"><WandSparkles size={17}/></div><div><b>Open cleanup review</b><span>Preview removals before applying</span></div><span className="action-arrow">↗</span></button><button className="action-row" onClick={() => setNav('analyzer')}><div className="action-icon blue-bg"><Fingerprint size={17}/></div><div><b>Analyze text patterns</b><span>Review non-conclusive signals</span></div><span className="action-arrow">↗</span></button><button className="action-row" onClick={() => copyText(code)}><div className="action-icon green-bg"><Clipboard size={17}/></div><div><b>Copy source</b><span>Copy current editor contents</span></div><span className="action-arrow">↗</span></button><div className="disclaimer-mini"><Info size={14}/><span>Character checks are deterministic; AI watermark attribution is not available here.</span></div></div></div>
        </>}

        {active === 'cleaner' && <div className="cleaner-layout"><div className="panel cleanup-settings"><div className="panel-heading"><div><h2><WandSparkles size={17}/> Cleanup rules</h2><p>Pick categories to include in the preview</p></div><span className="settings-chip">SELECTIVE</span></div><div className="rule-list"><Rule checked={selected.zero} onChange={v => setSelected(s => ({...s, zero:v}))} title="Zero-width & invisible characters" detail="U+200B, U+200D, word joiners, soft hyphens and related characters" count={issues.filter(i=>i.category==='zero').length}/><Rule checked={selected.control} onChange={v => setSelected(s => ({...s, control:v}))} title="Other format / control characters" detail="Directional controls and unusual format separators; line breaks and tabs are preserved" count={issues.filter(i=>i.category==='control').length}/><Rule checked={selected.bom} onChange={v => setSelected(s => ({...s, bom:v}))} title="Byte order mark (BOM)" detail="Remove U+FEFF wherever it occurs in the text" count={issues.filter(i=>i.cp===0xFEFF).length}/><div className="rule-item"><div className="rule-main"><label className="toggle"><input type="checkbox" checked={selected.confusable} onChange={e=>setSelected(s=>({...s,confusable:e.target.checked}))}/><span/></label><div><b>Lookalike Unicode characters</b><p>Detect non-Latin letters that appear inside Latin-looking words.</p><span className="caution-text">Extra review required — removal is off by default.</span></div></div><span className="rule-count">{issues.filter(i=>i.category==='confusable').length}</span></div><label className="sub-option"><input type="checkbox" checked={removeConfusables} onChange={e=>setRemoveConfusables(e.target.checked)}/> Allow removing detected Greek/Cyrillic characters <span>Risky</span></label></div><div className="cleanup-note"><Info size={16}/><p><b>Review first.</b> Some format characters are legitimate in multilingual text. CodeShield previews changes and never overwrites the editor automatically.</p></div><button className="btn btn-primary full-btn" onClick={doClean}><WandSparkles size={16}/> Generate cleanup preview</button></div><div className="panel preview-panel"><div className="panel-heading"><div><h2><ArrowLeftRight size={17}/> Preview changes</h2><p>Before you apply any edits</p></div>{cleaned && <span className="result-pill pill-ok">PREVIEW READY</span>}</div>{!cleaned ? <EmptyState icon={WandSparkles} title="No preview yet" text="Select cleanup rules and generate a preview. Your source remains untouched."/> : <><div className="preview-summary"><div><span>Characters queued</span><b>{cleaned.removed.length}</b></div><div><span>Before</span><b>{cleaned.before.length.toLocaleString()} chars</b></div><div><span>After</span><b>{cleaned.output.length.toLocaleString()} chars</b></div></div>{cleaned.removed.length ? <div className="removed-list"><div className="removed-head">REMOVAL LOG <span>{cleaned.removed.length} items</span></div>{cleaned.removed.slice(0,10).map((r,i)=><div className="removed-row" key={`${r.offset}-${i}`}><code>{r.hex}</code><span>Line {r.line}, col {r.col}</span><span className="removed-mark">removed</span></div>)}{cleaned.removed.length>10&&<p className="muted-small">And {cleaned.removed.length-10} more…</p>}</div>:<div className="no-removal"><Check size={16}/> No characters matched your selected rules.</div>}<div className="preview-buttons"><button className="btn btn-secondary" onClick={()=>copyText(cleaned.output)}><Clipboard size={15}/> Copy preview</button><button className="btn btn-primary" disabled={!cleaned.removed.length} onClick={applyClean}><CheckCheck size={15}/> Apply cleanup</button></div></>}</div></div>}

        {active === 'analyzer' && <div className="analyzer-layout"><div className="panel analyzer-score"><div className="panel-heading"><div><h2><Fingerprint size={17}/> Pattern analysis</h2><p>Signals in the current editor text</p></div><span className="settings-chip">HEURISTIC</span></div><div className="not-a-detector"><div className="not-a-detector-icon"><Info size={20}/></div><div><b>This is not an AI watermark detector</b><p>Token-based watermarks such as SynthID-Text cannot be reliably confirmed or removed by looking for Unicode characters. This panel only reports observable text features.</p></div></div><div className="signal-list"><Signal icon={ScanSearch} title="Invisible / format characters" value={zeroCount + controlCount} status={(zeroCount+controlCount)>0?'Review':'No signal'} tone={(zeroCount+controlCount)>0?'warn':'ok'} description="Directly detected Unicode characters in the configured set."/><Signal icon={AlertTriangle} title="Mixed-script lookalikes" value={confusableCount} status={confusableCount?'Review':'No signal'} tone={confusableCount?'warn':'ok'} description="Greek or Cyrillic characters found adjacent to Latin letters; may be intentional."/><Signal icon={Code2} title="Code structure" value={lineCount} status="Context only" tone="neutral" description="Line count and language heuristic provide context, not authorship evidence."/></div></div><div className="panel analyzer-side"><div className="panel-heading"><div><h2><ShieldCheck size={17}/> Interpretation guide</h2><p>What these signals can and can't tell you</p></div></div><div className="guide-block"><span className="guide-number">01</span><div><b>Character-level findings</b><p>These are exact code points found in the text and can be inspected at a specific location.</p></div></div><div className="guide-block"><span className="guide-number">02</span><div><b>Pattern-level guesses</b><p>Writing style and token patterns are not reliable proof of AI authorship, especially for short or edited code.</p></div></div><div className="guide-block"><span className="guide-number">03</span><div><b>Safe next step</b><p>Inspect findings, preserve a baseline, and only remove characters you understand.</p></div></div><button className="btn btn-secondary full-btn" onClick={()=>setNav('scanner')}><ScanSearch size={15}/> Return to scanner</button></div></div>}

        {active === 'diff' && <div className="diff-layout"><div className="panel diff-panel"><div className="panel-heading"><div><h2><ArrowLeftRight size={17}/> Baseline comparison</h2><p>Current editor vs. saved baseline</p></div><span className="settings-chip">TEXT DIFF</span></div><div className="diff-summary"><div><span>Baseline</span><b>{original.length.toLocaleString()} chars</b></div><div><span>Current</span><b>{code.length.toLocaleString()} chars</b></div><div><span>Net change</span><b className={code.length-original.length===0?'':'change-value'}>{code.length-original.length>0?'+':''}{code.length-original.length}</b></div></div><div className="diff-columns"><div className="diff-column"><div className="diff-label"><span className="diff-dot old"/> BASELINE <button onClick={()=>copyText(original)}><Clipboard size={13}/></button></div><pre>{original || '(empty baseline)'}</pre></div><div className="diff-column"><div className="diff-label"><span className="diff-dot current"/> CURRENT <button onClick={()=>copyText(code)}><Clipboard size={13}/></button></div><pre>{code || '(empty editor)'}</pre></div></div><div className="diff-actions"><button className="btn btn-secondary" onClick={()=>{setOriginal(code);setNotice('Current code saved as the new baseline')}}><Check size={15}/> Save current as baseline</button><button className="btn btn-secondary" onClick={downloadText}><ArrowDownToLine size={15}/> Export current text</button></div><div className="diff-footnote"><Info size={14}/> This comparison shows the two text snapshots side by side; it is not a syntax-aware or line-by-line diff yet.</div></div></div>}

        {active === 'history' && <div className="panel history-panel"><div className="panel-heading"><div><h2><History size={17}/> Recent scans</h2><p>Stored locally in this browser</p></div><button className="btn btn-secondary btn-small" onClick={()=>{setHistory([]);setNotice('Local scan history cleared')}}><Trash2 size={14}/> Clear history</button></div>{!history.length ? <EmptyState icon={History} title="No scan history yet" text="Run a scan and your recent session summary will show up here."/> : <div className="history-list">{history.map(h=><div className="history-row" key={h.id}><div className={`history-result-icon ${h.count?'has-issues':''}`}>{h.count?<AlertTriangle size={17}/>:<ShieldCheck size={17}/>}</div><div className="history-detail"><b>{h.count ? `${h.count} finding${h.count===1?'':'s'} detected` : 'No flagged characters'}</b><span>{h.at} · {h.chars.toLocaleString()} chars</span><small>{h.preview}</small></div><button className="btn btn-secondary btn-small" onClick={()=>{setCode(h.preview==='(empty code)'?'':h.preview);setNotice('Loaded saved preview only — history does not store full source code')}}>Load preview</button></div>)}</div>}</div>}

        <footer className="page-footer"><div><ShieldCheck size={15}/><span><b>Privacy-first by design</b> <i>·</i> Processing runs locally in your browser</span></div><span>CodeShield <b>v1.0.0</b></span></footer>
      </section>
    </main>
    {notice && <div className="toast" role="status"><div className="toast-check"><Check size={15}/></div><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="Dismiss notification"><X size={14}/></button></div>}
  </div>
}

function Metric({icon:Icon,label,value,hint,tone}) { return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18}/></div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-hint">{hint}</div></div> }
function EmptyState({icon:Icon,title,text}) { return <div className="empty-state"><div className="empty-icon"><Icon size={21}/></div><b>{title}</b><p>{text}</p></div> }
function Finding({item,onLocate}) { return <button className="finding-row" onClick={onLocate}><span className={`finding-icon ${item.category==='confusable'?'orange':'purple'}`}>{item.category==='confusable'?<AlertTriangle size={15}/>:<Fingerprint size={15}/>}</span><span className="finding-detail"><b>{item.name}</b><small>{item.hex} · {item.category==='confusable'?'Lookalike signal':'Invisible / format'}</small></span><span className="finding-location">L{item.line}:C{item.col}</span><span className="finding-arrow">↗</span></button> }
function Rule({checked,onChange,title,detail,count}) { return <div className="rule-item"><div className="rule-main"><label className="toggle"><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/><span/></label><div><b>{title}</b><p>{detail}</p></div></div><span className={`rule-count ${count?'has-count':''}`}>{count}</span></div> }
function Signal({icon:Icon,title,value,status,tone,description}) { return <div className="signal-row"><div className={`signal-icon ${tone}`}><Icon size={17}/></div><div className="signal-info"><b>{title}</b><p>{description}</p></div><div className="signal-result"><b>{value}</b><span className={`signal-status ${tone}`}>{status}</span></div></div> }
