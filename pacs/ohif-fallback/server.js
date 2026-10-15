const http = require('http');
const { URL } = require('url');

const PORT = Number(process.env.PORT || process.env.OHIF_PORT || 3005);
const HOST = process.env.HOST || '127.0.0.1';
const BACKEND_URL = (process.env.BACKEND_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');

const html = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>VIARA PACS Viewer</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #020617;
      --panel: #07111f;
      --panel-2: #0b1626;
      --panel-3: #101d30;
      --line: #26364d;
      --line-soft: #18263a;
      --text: #e5eefb;
      --muted: #9aacc5;
      --faint: #667b98;
      --accent: #14b8a6;
      --accent-2: #38bdf8;
      --warn: #f59e0b;
      --danger: #f87171;
      --shadow: rgba(0, 0, 0, .36);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body { margin: 0; overflow: hidden; background: #000814; color: var(--text); }
    button, input, select { font: inherit; }
    .shell { display: grid; grid-template-rows: auto minmax(0, 1fr); width: 100vw; height: 100vh; height: 100dvh; overflow: hidden; }
    .topbar {
      display: grid; grid-template-columns: minmax(170px, .7fr) minmax(0, 2.5fr) minmax(150px, .55fr);
      align-items: center; gap: 8px; min-height: 52px; padding: 6px 8px;
      border-bottom: 1px solid var(--line);
      background: linear-gradient(180deg, #101c2f 0%, #07101d 100%);
      box-shadow: 0 10px 30px var(--shadow);
      overflow: visible;
    }
    .iconSprite { position: absolute; width: 0; height: 0; overflow: hidden; }
    .brand { min-width: 0; display: flex; align-items: center; gap: 10px; }
    .brandMark {
      display: flex; width: 34px; height: 34px; flex: 0 0 auto; align-items: center; justify-content: center;
      border: 1px solid rgba(20,184,166,.35); border-radius: 8px;
      background: linear-gradient(180deg, rgba(20,184,166,.18), rgba(56,189,248,.08));
      color: #99f6e4; font-size: 13px; font-weight: 950; letter-spacing: .04em;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 0 24px rgba(20,184,166,.08);
    }
    .brandText { min-width: 0; }
    .brand h1 { margin: 0; font-size: 12px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
    .subtitle { margin-top: 2px; overflow: hidden; color: var(--muted); font: 10px ui-monospace, SFMono-Regular, Consolas, monospace; text-overflow: ellipsis; white-space: nowrap; }
    .toolbar { display: flex; min-width: 0; align-items: center; justify-content: center; gap: 4px; flex-wrap: wrap; overflow: visible; }
    .toolgroup {
      display: inline-flex; min-width: 0; align-items: center; gap: 3px; padding: 2px;
      border: 1px solid rgba(38,54,77,.9); border-radius: 8px;
      background: linear-gradient(180deg, #0e1a2b, #07111f);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.035);
      overflow: visible;
    }
    .iconbtn, .select, .range {
      min-height: 28px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--text);
    }
    .iconbtn { position: relative; display: inline-flex; min-width: 28px; align-items: center; justify-content: center; gap: 5px; padding: 0 7px; cursor: pointer; font-size: 11px; font-weight: 900; white-space: nowrap; transition: background .14s ease, border-color .14s ease, color .14s ease, transform .08s ease; }
    .iconbtn:hover, .iconbtn.active { border-color: #1f9d92; background: rgba(20,184,166,.14); color: #99f6e4; }
    .iconbtn:active { transform: translateY(1px); }
    .iconbtn:disabled { cursor: not-allowed; opacity: .35; }
    .icon { width: 14px; height: 14px; flex: 0 0 auto; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; fill: none; }
    .btnLabel {
      position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0);
      clip-path: inset(50%); white-space: nowrap;
    }
    .iconbtn[data-tip]::before,
    .iconbtn[data-tip]::after {
      position: absolute; left: 50%; opacity: 0; pointer-events: none; transform: translate(-50%, 4px);
      transition: opacity .12s ease, transform .12s ease; z-index: 100;
    }
    .iconbtn[data-tip]::before {
      content: ""; top: calc(100% + 4px); border: 5px solid transparent; border-bottom-color: #111c2f;
    }
    .iconbtn[data-tip]::after {
      content: attr(data-tip); top: calc(100% + 14px); max-width: 220px; white-space: nowrap;
      border: 1px solid rgba(56,189,248,.28); border-radius: 7px;
      background: #111c2f; color: #e5eefb; padding: 5px 8px;
      box-shadow: 0 10px 24px rgba(0,0,0,.42); font-size: 11px; font-weight: 800;
    }
    .iconbtn[data-tip]:hover::before,
    .iconbtn[data-tip]:hover::after,
    .iconbtn[data-tip]:focus-visible::before,
    .iconbtn[data-tip]:focus-visible::after {
      opacity: 1; transform: translate(-50%, 0);
    }
    .select { max-width: 132px; padding: 0 24px 0 8px; border-color: rgba(38,54,77,.9); background: var(--panel-2); color: var(--text); font-size: 11px; font-weight: 700; outline: none; }
    .select:focus-visible, .iconbtn:focus-visible, .search:focus-visible, .actionBtn:focus-visible, .tab:focus-visible { outline: 2px solid rgba(56,189,248,.8); outline-offset: 1px; }
    .range { width: clamp(72px, 6vw, 100px); accent-color: var(--accent); }
    .patient {
      min-width: 0; text-align: right; border: 1px solid rgba(38,54,77,.75); border-radius: 9px;
      background: rgba(2,6,23,.38); padding: 6px 9px; box-shadow: inset 0 1px 0 rgba(255,255,255,.03);
    }
    .patient strong { display: block; overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
    .patient span { display: block; margin-top: 2px; color: var(--muted); font-size: 10px; }
    .workspace { display: grid; grid-template-columns: clamp(220px, 18vw, 280px) minmax(0, 1fr) clamp(260px, 22vw, 330px); grid-template-areas: "sidebar viewport inspector"; min-height: 0; }
    html[dir="rtl"] .workspace { grid-template-columns: clamp(260px, 22vw, 330px) minmax(0, 1fr) clamp(220px, 18vw, 280px); grid-template-areas: "inspector viewport sidebar"; }
    .shell.layout-focus .workspace { grid-template-columns: minmax(0, 1fr); grid-template-areas: "viewport"; }
    .shell.layout-focus .sidebar, .shell.layout-focus .inspector { display: none; }
    .shell.layout-noInspector .workspace { grid-template-columns: 280px minmax(0, 1fr); grid-template-areas: "sidebar viewport"; }
    html[dir="rtl"] .shell.layout-noInspector .workspace { grid-template-columns: minmax(0, 1fr) 280px; grid-template-areas: "viewport sidebar"; }
    .shell.layout-noInspector .inspector { display: none; }
    .sidebar, .inspector { min-height: 0; overflow: hidden; border-color: var(--line); background: linear-gradient(180deg, #081321, #050d18); }
    .sidebar { grid-area: sidebar; border-right: 1px solid var(--line); }
    .inspector { grid-area: inspector; border-left: 1px solid var(--line); }
    .viewportWrap { grid-area: viewport; }
    html[dir="rtl"] .sidebar { border-right: 0; border-left: 1px solid var(--line); }
    html[dir="rtl"] .inspector { border-left: 0; border-right: 1px solid var(--line); }
    .panelhead {
      display: flex; min-height: 40px; align-items: center; justify-content: space-between; gap: 8px;
      padding: 8px 10px; border-bottom: 1px solid var(--line-soft); background: linear-gradient(180deg, rgba(17,28,49,.92), rgba(8,17,31,.88));
    }
    .panelhead h2 { margin: 0; color: #cbd5e1; font-size: 11px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; }
    .panelbody { height: calc(100% - 40px); overflow: auto; padding: 8px; }
    .search { width: 100%; min-height: 34px; border: 1px solid var(--line); border-radius: 7px; background: #030a14; color: var(--text); padding: 0 10px; font-size: 12px; outline: none; }
    .search:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(20,184,166,.13); }
    .series { margin-top: 10px; display: grid; gap: 8px; }
    .seriesBtn {
      width: 100%; border: 1px solid var(--line-soft); border-radius: 8px; background: linear-gradient(180deg, #0d1828, #08111f); color: var(--text);
      padding: 7px; text-align: left; cursor: pointer; display: flex; gap: 8px; align-items: center; transition: all 0.15s ease;
    }
    html[dir="rtl"] .seriesBtn { text-align: right; flex-direction: row-reverse; }
    .seriesBtn:hover { border-color: rgba(20,184,166,.75); background: rgba(20,184,166,.05); }
    .seriesBtn.active { border-color: var(--accent); background: linear-gradient(180deg, rgba(20,184,166,.16), rgba(20,184,166,.07)); box-shadow: inset 3px 0 0 var(--accent); }
    .seriesCover {
      position: relative; width: 52px; height: 52px; flex-shrink: 0; border-radius: 6px;
      background: #02060d; border: 1px solid var(--line-soft); overflow: hidden;
      display: flex; align-items: center; justify-content: center;
    }
    .seriesCover img { width: 100%; height: 100%; object-fit: contain; }
    .seriesCover .badge { position: absolute; bottom: 2px; right: 2px; font-size: 8px; padding: 1px 4px; border-radius: 4px; }
    html[dir="rtl"] .seriesCover .badge { right: auto; left: 2px; }
    .seriesInfo { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }
    .seriesName { font-size: 12px; font-weight: 800; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .seriesMeta { font-size: 11px; color: var(--muted); }
    .badge { border-radius: 999px; background: rgba(56,189,248,.14); color: #bae6fd; padding: 2px 7px; font-size: 10px; font-weight: 900; border: 1px solid rgba(56,189,248,.18); }
    .viewportWrap { display: grid; grid-template-rows: minmax(0, 1fr) 36px; min-width: 0; min-height: 0; background: #000; box-shadow: inset 0 0 0 1px #050b14; }
    .viewport {
      position: relative; min-width: 0; min-height: 0; overflow: hidden;
      background:
        radial-gradient(circle at center, rgba(16,24,40,.48), transparent 45%),
        linear-gradient(45deg, #02050a 25%, #050914 25%, #050914 50%, #02050a 50%, #02050a 75%, #050914 75%);
      background-size: auto, 20px 20px;
    }
    .viewport::before {
      content: ""; position: absolute; inset: 14px; z-index: 1; pointer-events: none;
      border: 1px solid rgba(148,163,184,.08); border-radius: 2px;
      box-shadow: inset 0 0 80px rgba(0,0,0,.28);
    }
    .imageLayer { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
    .dicomImg {
      max-width: 100%; max-height: 100%; image-rendering: auto; user-select: none; -webkit-user-drag: none;
      transform-origin: center center; transition: filter .12s ease;
    }
    .overlay { position: absolute; z-index: 5; color: #dbeafe; font: 11px ui-monospace, SFMono-Regular, Consolas, monospace; text-shadow: 0 1px 3px #000; pointer-events: none; background: rgba(0,0,0,.18); border-radius: 4px; padding: 3px 5px; }
    .tl { top: 12px; left: 14px; } .tr { top: 12px; right: 14px; text-align: right; } .bl { bottom: 12px; left: 14px; } .br { bottom: 12px; right: 14px; text-align: right; }
    .crosshair::before, .crosshair::after { content: ""; position: absolute; background: rgba(20,184,166,.5); pointer-events: none; }
    .crosshair::before { top: 50%; left: 0; right: 0; height: 1px; }
    .crosshair::after { left: 50%; top: 0; bottom: 0; width: 1px; }
    .measureLine { position: absolute; height: 2px; background: #22d3ee; transform-origin: left center; box-shadow: 0 0 0 1px #082f49; pointer-events: none; z-index: 6; }
    .measureLabel { position: absolute; z-index: 7; border-radius: 5px; background: rgba(2,6,23,.86); color: #a5f3fc; padding: 3px 6px; font: 11px ui-monospace, SFMono-Regular, Consolas, monospace; pointer-events: none; }
    .empty {
      position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 30px; color: var(--muted); text-align: center;
    }
    .empty strong { color: #e2e8f0; font-size: 15px; }
    .empty p { max-width: 520px; margin: 8px 0 0; font-size: 12px; line-height: 1.6; }
    .fullscreenPrompt {
      position: absolute; z-index: 20; top: 14px; left: 50%; transform: translateX(-50%);
      display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--line);
      border-radius: 8px; background: rgba(2,6,23,.92); box-shadow: 0 12px 34px rgba(0,0,0,.34);
      color: #cbd5e1; font-size: 12px;
    }
    .fullscreenPrompt[hidden] { display: none; }
    .miniBtn { min-height: 28px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel-2); color: var(--text); padding: 0 9px; cursor: pointer; font-size: 11px; font-weight: 900; }
    .miniBtn:hover { border-color: var(--accent); color: #99f6e4; }
    .filmstrip {
      display: flex; align-items: center; gap: 8px; min-width: 0; padding: 0 10px; border-top: 1px solid var(--line);
      background: linear-gradient(180deg, #0a1422, #050c16); color: var(--muted); font-size: 11px;
    }
    .viewHud { margin-inline-start: auto; color: #bae6fd; font: 11px ui-monospace, SFMono-Regular, Consolas, monospace; white-space: nowrap; }
    #viewportStatus { border-radius: 999px; padding: 2px 8px; background: rgba(56,189,248,.08); color: #bae6fd; border: 1px solid rgba(56,189,248,.14); white-space: nowrap; }
    #viewportStatus.warn { background: rgba(245,158,11,.12); color: #fbbf24; border-color: rgba(245,158,11,.28); }
    #viewportStatus.danger { background: rgba(248,113,113,.12); color: #fca5a5; border-color: rgba(248,113,113,.28); }
    .slider { flex: 1; min-width: 120px; accent-color: var(--accent); }
    .kv { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--line-soft); font-size: 12px; }
    .kv .k { color: var(--faint); font-weight: 800; }
    .kv .v { min-width: 0; color: #cbd5e1; overflow-wrap: anywhere; }
    .tabs { display: flex; min-width: 0; gap: 3px; padding: 3px; border: 1px solid var(--line-soft); border-radius: 8px; background: #060d18; }
    .tab { min-height: 26px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); padding: 0 7px; cursor: pointer; font-size: 10px; font-weight: 900; }
    .tab.active { background: rgba(20,184,166,.14); color: #99f6e4; }
    .tagtable { width: 100%; border-collapse: collapse; font-size: 11px; }
    .tagtable td { border-bottom: 1px solid var(--line-soft); padding: 7px 4px; vertical-align: top; }
    .actionGrid { display: grid; gap: 8px; margin-top: 10px; }
    .actionBtn { min-height: 34px; border: 1px solid var(--line); border-radius: 7px; background: var(--panel-2); color: var(--text); padding: 0 10px; cursor: pointer; text-align: left; font-size: 12px; font-weight: 800; }
    html[dir="rtl"] .actionBtn { text-align: right; }
    .actionBtn:hover { border-color: var(--accent); color: #99f6e4; }
    .mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    .status { color: var(--muted); font-size: 11px; }
    .danger { color: var(--danger); } .warn { color: var(--warn); }
    /* Toggle Sidebar functionality */
    .shell.sidebar-collapsed .workspace {
      grid-template-columns: minmax(0, 1fr) !important;
      grid-template-areas: "viewport" !important;
    }
    .shell.sidebar-collapsed .sidebar {
      display: none !important;
    }

    @media (max-width: 1280px) {
      .topbar { grid-template-columns: minmax(150px, .45fr) minmax(0, 1fr); }
      .patient { display: none !important; }
      .workspace { grid-template-columns: 210px minmax(0, 1fr) 270px; }
      html[dir="rtl"] .workspace { grid-template-columns: 270px minmax(0, 1fr) 210px; }
    }

    @media (max-width: 1024px) {
      .topbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        min-height: 0;
        padding: 6px;
      }
      .brand { flex: 1 1 150px; }
      .toolbar { flex: 999 1 520px; justify-content: flex-end; }
      .workspace {
        grid-template-columns: 80px minmax(0, 1fr);
        grid-template-areas: "sidebar viewport";
      }
      .inspector { display: none !important; }
      .sidebar .panelhead h2 { display: none; }
      .sidebar .panelhead { justify-content: center; padding: 10px 4px; }
      .sidebar .panelbody { padding: 4px; }
      .seriesBtn { padding: 4px; justify-content: center; border-radius: 6px; }
      .seriesCover { width: 54px; height: 54px; }
      .seriesInfo { display: none !important; }
      .search { display: none !important; }
    }

    @media (max-width: 640px) {
      .topbar {
        flex-direction: column;
        align-items: stretch;
        height: auto;
      }
      .shell {
        grid-template-rows: auto 1fr;
      }
      .brand {
        text-align: center;
      }
      .toolbar {
        flex-wrap: wrap;
        justify-content: center;
      }
      .toolgroup { max-width: 100%; flex-wrap: wrap; justify-content: center; }
      .range { width: min(96px, 28vw); }
      .workspace {
        grid-template-columns: minmax(0, 1fr);
        grid-template-areas: "viewport";
      }
      .sidebar {
        display: none;
      }
      .shell.sidebar-mobile-open .sidebar {
        display: block !important;
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        width: 80px;
        z-index: 10;
        box-shadow: 6px 0 18px rgba(0,0,0,.5);
      }
      html[dir="rtl"] .shell.sidebar-mobile-open .sidebar {
        left: auto;
        right: 0;
      }
    }

    @media (max-height: 760px) {
      .topbar { padding-top: 4px; padding-bottom: 4px; }
      .iconbtn, .select, .range { min-height: 26px; }
      .iconbtn { min-width: 26px; padding: 0 6px; }
      .panelhead { min-height: 36px; padding-top: 6px; padding-bottom: 6px; }
      .panelbody { height: calc(100% - 36px); padding: 6px; }
      .series { gap: 6px; }
      .seriesBtn { padding: 6px; }
      .seriesCover { width: 46px; height: 46px; }
      .viewportWrap { grid-template-rows: minmax(0, 1fr) 32px; }
    }
  </style>
</head>
<body>
  <svg class="iconSprite" aria-hidden="true" focusable="false">
    <symbol id="i-panel" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></symbol>
    <symbol id="i-pan" viewBox="0 0 24 24"><path d="M12 3v18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12h18M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/></symbol>
    <symbol id="i-ruler" viewBox="0 0 24 24"><path d="M4 18 18 4l2 2L6 20zM8 16l-2-2M11 13l-2-2M14 10l-2-2M17 7l-2-2"/></symbol>
    <symbol id="i-crosshair" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></symbol>
    <symbol id="i-prev" viewBox="0 0 24 24"><path d="M15 6 9 12l6 6M9 6v12"/></symbol>
    <symbol id="i-next" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6M15 6v12"/></symbol>
    <symbol id="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/></symbol>
    <symbol id="i-pause" viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" stroke="none"/></symbol>
    <symbol id="i-zoom-out" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M16 16l5 5M7.5 10.5h6"/></symbol>
    <symbol id="i-zoom-in" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M16 16l5 5M7.5 10.5h6M10.5 7.5v6"/></symbol>
    <symbol id="i-fit" viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></symbol>
    <symbol id="i-rotate-left" viewBox="0 0 24 24"><path d="M7 7H3V3M4 7a8 8 0 1 1-1 7"/></symbol>
    <symbol id="i-rotate-right" viewBox="0 0 24 24"><path d="M17 7h4V3M20 7a8 8 0 1 0 1 7"/></symbol>
    <symbol id="i-flip-h" viewBox="0 0 24 24"><path d="M12 4v16M4 7l6 5-6 5zM20 7l-6 5 6 5z"/></symbol>
    <symbol id="i-flip-v" viewBox="0 0 24 24"><path d="M4 12h16M7 4l5 6 5-6zM7 20l5-6 5 6z"/></symbol>
    <symbol id="i-invert" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4v16M12 20a8 8 0 0 0 0-16"/></symbol>
    <symbol id="i-reset" viewBox="0 0 24 24"><path d="M4 7v5h5M5 12a7 7 0 1 0 2-5"/></symbol>
    <symbol id="i-fullscreen" viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></symbol>
  </svg>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <span class="brandMark" aria-hidden="true">RV</span>
        <div class="brandText">
          <h1>VIARA Diagnostic Viewer</h1>
          <div class="subtitle" id="studyUidLabel"></div>
        </div>
      </div>
      <div class="toolbar" aria-label="Viewer tools">
        <div class="toolgroup">
          <button class="iconbtn" id="toggleSidebar" data-tip="Toggle sidebar" title="Toggle sidebar" aria-label="Toggle sidebar">
            <svg class="icon" aria-hidden="true"><use href="#i-panel"></use></svg><span class="btnLabel">Toggle sidebar</span>
          </button>
        </div>
        <div class="toolgroup">
          <button class="iconbtn active" id="toolPan" data-tip="Pan" title="Pan" aria-label="Pan"><svg class="icon" aria-hidden="true"><use href="#i-pan"></use></svg><span class="btnLabel">Pan</span></button>
          <button class="iconbtn" id="toolMeasure" data-tip="Measure" title="Measure" aria-label="Measure"><svg class="icon" aria-hidden="true"><use href="#i-ruler"></use></svg><span class="btnLabel">Measure</span></button>
          <button class="iconbtn" id="toggleCrosshair" data-tip="Crosshair" title="Crosshair" aria-label="Crosshair"><svg class="icon" aria-hidden="true"><use href="#i-crosshair"></use></svg><span class="btnLabel">Crosshair</span></button>
        </div>
        <div class="toolgroup">
          <button class="iconbtn" id="prevInstance" data-tip="Previous instance" title="Previous instance" aria-label="Previous instance"><svg class="icon" aria-hidden="true"><use href="#i-prev"></use></svg><span class="btnLabel">Previous instance</span></button>
          <button class="iconbtn" id="playCine" data-tip="Play" title="Play" aria-label="Play"><svg class="icon" aria-hidden="true"><use href="#i-play"></use></svg><span class="btnLabel">Play</span></button>
          <button class="iconbtn" id="nextInstance" data-tip="Next instance" title="Next instance" aria-label="Next instance"><svg class="icon" aria-hidden="true"><use href="#i-next"></use></svg><span class="btnLabel">Next instance</span></button>
          <select class="select" id="cineSpeed" title="Cine speed">
            <option value="1">1 fps</option>
            <option value="3">3 fps</option>
            <option value="5" selected>5 fps</option>
            <option value="10">10 fps</option>
          </select>
        </div>
        <div class="toolgroup">
          <button class="iconbtn" id="zoomOut" data-tip="Zoom out" title="Zoom out" aria-label="Zoom out"><svg class="icon" aria-hidden="true"><use href="#i-zoom-out"></use></svg><span class="btnLabel">Zoom out</span></button>
          <button class="iconbtn" id="fitImage" data-tip="Fit" title="Fit" aria-label="Fit"><svg class="icon" aria-hidden="true"><use href="#i-fit"></use></svg><span class="btnLabel">Fit</span></button>
          <button class="iconbtn" id="zoomIn" data-tip="Zoom in" title="Zoom in" aria-label="Zoom in"><svg class="icon" aria-hidden="true"><use href="#i-zoom-in"></use></svg><span class="btnLabel">Zoom in</span></button>
          <button class="iconbtn" id="rotateLeft" data-tip="Rotate left" title="Rotate left" aria-label="Rotate left"><svg class="icon" aria-hidden="true"><use href="#i-rotate-left"></use></svg><span class="btnLabel">Rotate left</span></button>
          <button class="iconbtn" id="rotateRight" data-tip="Rotate right" title="Rotate right" aria-label="Rotate right"><svg class="icon" aria-hidden="true"><use href="#i-rotate-right"></use></svg><span class="btnLabel">Rotate right</span></button>
          <button class="iconbtn" id="flipHorizontal" data-tip="Flip horizontal" title="Flip horizontal" aria-label="Flip horizontal"><svg class="icon" aria-hidden="true"><use href="#i-flip-h"></use></svg><span class="btnLabel">Flip horizontal</span></button>
          <button class="iconbtn" id="flipVertical" data-tip="Flip vertical" title="Flip vertical" aria-label="Flip vertical"><svg class="icon" aria-hidden="true"><use href="#i-flip-v"></use></svg><span class="btnLabel">Flip vertical</span></button>
          <button class="iconbtn" id="invertImage" data-tip="Invert" title="Invert" aria-label="Invert"><svg class="icon" aria-hidden="true"><use href="#i-invert"></use></svg><span class="btnLabel">Invert</span></button>
          <button class="iconbtn" id="resetView" data-tip="Reset" title="Reset" aria-label="Reset"><svg class="icon" aria-hidden="true"><use href="#i-reset"></use></svg><span class="btnLabel">Reset</span></button>
          <button class="iconbtn" id="fullscreen" data-tip="Fullscreen" title="Fullscreen" aria-label="Fullscreen"><svg class="icon" aria-hidden="true"><use href="#i-fullscreen"></use></svg><span class="btnLabel">Fullscreen</span></button>
        </div>
        <div class="toolgroup">
          <select class="select" id="preset" title="Window preset">
            <option value="default">Default</option>
            <option value="lung">Lung</option>
            <option value="bone">Bone</option>
            <option value="brain">Brain</option>
            <option value="soft">Soft tissue</option>
          </select>
          <input class="range" id="contrast" type="range" min="30" max="220" value="100" title="Contrast" />
          <input class="range" id="brightness" type="range" min="40" max="180" value="100" title="Brightness" />
        </div>
        <div class="toolgroup">
          <select class="select" id="layoutMode" title="Layout">
            <option value="default">Default</option>
            <option value="noInspector">Review</option>
            <option value="focus">Focus</option>
          </select>
          <select class="select" id="languageSelect" title="Language">
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </div>
      </div>
      <div class="patient">
        <strong id="patientName">Loading...</strong>
        <span id="patientLine"></span>
      </div>
    </header>

    <section class="workspace">
      <aside class="sidebar">
        <div class="panelhead">
          <h2>Series</h2>
          <span class="status" id="seriesCount">0</span>
        </div>
        <div class="panelbody">
          <input class="search" id="seriesSearch" placeholder="Filter series" />
          <div class="series" id="seriesList"></div>
        </div>
      </aside>

      <main class="viewportWrap">
        <section class="viewport" id="viewport">
          <div class="imageLayer" id="imageLayer"></div>
          <div class="overlay tl" id="overlayTL"></div>
          <div class="overlay tr" id="overlayTR"></div>
          <div class="overlay bl" id="overlayBL"></div>
          <div class="overlay br" id="overlayBR"></div>
          <div id="measurement"></div>
          <div class="fullscreenPrompt" id="fullscreenPrompt" hidden>
            <span>Dedicated viewer tab ready</span>
            <button class="miniBtn" id="enterFullscreen" type="button">Enter fullscreen</button>
            <button class="miniBtn" id="dismissFullscreen" type="button">Dismiss</button>
          </div>
        </section>
        <div class="filmstrip">
          <span class="mono" id="instanceLabel">0/0</span>
          <input class="slider" id="instanceSlider" type="range" min="0" max="0" value="0" />
          <span id="viewportStatus">Initializing</span>
          <span class="viewHud" id="viewHud"></span>
        </div>
      </main>

      <aside class="inspector">
        <div class="panelhead">
          <h2>Inspector</h2>
          <div class="tabs">
            <button class="tab active" data-tab="summary">Summary</button>
            <button class="tab" data-tab="tags">Tags</button>
            <button class="tab" data-tab="actions">Actions</button>
          </div>
        </div>
        <div class="panelbody" id="inspectorBody"></div>
      </aside>
    </section>
  </div>

  <script>
    const params = new URLSearchParams(location.search);
    const studyUid = params.get('StudyInstanceUIDs') || params.get('study') || '';
    const VIARA_TOKEN = params.get('VIARA_token') || '';
    // Remove token from URL bar immediately so it's not visible in history
    if (VIARA_TOKEN) { params.delete('VIARA_token'); history.replaceState(null, '', location.pathname + '?' + params.toString()); }
    const shouldPromptFullscreen = params.get('fullscreen') === '1';
    const translations = {
      en: {
        title: 'VIARA Diagnostic Viewer', series: 'Series', inspector: 'Inspector', summary: 'Summary', tags: 'Tags', actions: 'Actions',
        filterSeries: 'Filter series', searchTags: 'Search DICOM tags', noMatchingTags: 'No matching tags',
        pan: 'Pan', measure: 'Measure', crosshair: 'Crosshair', play: 'Play', pause: 'Pause', fit: 'Fit', invert: 'Inv', reset: 'Reset', fullscreen: 'Full',
        previous: 'Previous instance', next: 'Next instance', rotateLeft: 'Rotate left', rotateRight: 'Rotate right', flipH: 'Flip horizontal', flipV: 'Flip vertical',
        preset: 'Window preset', default: 'Default', lung: 'Lung', bone: 'Bone', brain: 'Brain', soft: 'Soft tissue',
        layout: 'Layout', layoutDefault: 'Default', layoutReview: 'Review', layoutFocus: 'Focus', language: 'Language',
        loading: 'Loading...', initializing: 'Initializing', noStudyUid: 'No study UID', noStudyTitle: 'No study selected',
        noStudyHelp: 'Open images from a linked examination in VIARA.', noStudyLinked: 'Open the viewer from an exam with linked DICOM images.',
        loadingMetadata: 'Loading DICOM metadata', renderedLoaded: 'Rendered image loaded', metadataOnly: 'Metadata-only mode',
        renderUnavailableTitle: 'Pixel rendering unavailable',
        renderUnavailableHelp: 'Metadata is loaded, but Orthanc did not return a rendered image for this instance. Install the official OHIF image or enable DICOMweb rendered retrieval for full diagnostic pixels.',
        viewerUnavailable: 'Viewer unavailable', loadFailed: 'Load failed', couldNotLoad: 'Could not load study',
        unknownPatient: 'Unknown patient', noMetadata: 'No metadata was returned for this study.', studyUidMissing: 'No StudyInstanceUID supplied',
        patient: 'Patient', patientId: 'Patient ID', birthDate: 'Birth date', accession: 'Accession', studyDate: 'Study date',
        modality: 'Modality', bodyPart: 'Body part', seriesUid: 'Series UID', sopUid: 'SOP UID',
        rendered: 'Rendered', metadata: 'Metadata', state: 'State', openImage: 'Open image', openJson: 'Open JSON',
        imageRendered: 'Image rendered', copyStudy: 'Copy study UID', copySeries: 'Copy series UID', copyInstance: 'Copy instance UID',
        copied: 'Copied to clipboard', copyFailed: 'Copy failed', tabReady: 'Dedicated viewer tab ready', enterFullscreen: 'Enter fullscreen', dismiss: 'Dismiss',
        instancesShort: 'inst', ser: 'Ser', img: 'Img', zoom: 'Zoom', rot: 'Rot', window: 'W'
      },
      ar: {
        title: 'عارض VIARA التشخيصي', series: 'السلاسل', inspector: 'الفاحص', summary: 'ملخص', tags: 'الوسوم', actions: 'إجراءات',
        filterSeries: 'تصفية السلاسل', searchTags: 'بحث في وسوم DICOM', noMatchingTags: 'لا توجد وسوم مطابقة',
        pan: 'تحريك', measure: 'قياس', crosshair: 'مؤشر', play: 'تشغيل', pause: 'إيقاف', fit: 'ملاءمة', invert: 'عكس', reset: 'إعادة', fullscreen: 'ملء',
        previous: 'الصورة السابقة', next: 'الصورة التالية', rotateLeft: 'تدوير لليسار', rotateRight: 'تدوير لليمين', flipH: 'قلب أفقي', flipV: 'قلب رأسي',
        preset: 'إعداد النافذة', default: 'افتراضي', lung: 'رئة', bone: 'عظام', brain: 'دماغ', soft: 'أنسجة رخوة',
        layout: 'التخطيط', layoutDefault: 'افتراضي', layoutReview: 'مراجعة', layoutFocus: 'تركيز', language: 'اللغة',
        loading: 'جاري التحميل...', initializing: 'بدء التشغيل', noStudyUid: 'لا يوجد معرف دراسة', noStudyTitle: 'لم يتم اختيار دراسة',
        noStudyHelp: 'افتح الصور من فحص مرتبط داخل VIARA.', noStudyLinked: 'افتح العارض من فحص يحتوي على صور DICOM مرتبطة.',
        loadingMetadata: 'جاري تحميل بيانات DICOM', renderedLoaded: 'تم تحميل الصورة', metadataOnly: 'وضع البيانات فقط',
        renderUnavailableTitle: 'تعذر عرض البكسلات',
        renderUnavailableHelp: 'تم تحميل البيانات الوصفية، لكن Orthanc لم يرجع صورة معروضة لهذه اللقطة. ثبّت عارض OHIF الرسمي أو فعّل استرجاع DICOMweb rendered لعرض البكسلات.',
        viewerUnavailable: 'العارض غير متاح', loadFailed: 'فشل التحميل', couldNotLoad: 'تعذر تحميل الدراسة',
        unknownPatient: 'مريض غير معروف', noMetadata: 'لم ترجع أي بيانات وصفية لهذه الدراسة.', studyUidMissing: 'لم يتم تمرير StudyInstanceUID',
        patient: 'المريض', patientId: 'رقم المريض', birthDate: 'تاريخ الميلاد', accession: 'رقم الوصول', studyDate: 'تاريخ الدراسة',
        modality: 'النوع', bodyPart: 'الجزء', seriesUid: 'معرف السلسلة', sopUid: 'معرف اللقطة',
        rendered: 'الصورة', metadata: 'البيانات', state: 'الحالة', openImage: 'فتح الصورة', openJson: 'فتح JSON',
        imageRendered: 'تم عرض الصورة', copyStudy: 'نسخ معرف الدراسة', copySeries: 'نسخ معرف السلسلة', copyInstance: 'نسخ معرف اللقطة',
        copied: 'تم النسخ', copyFailed: 'فشل النسخ', tabReady: 'تبويب العارض جاهز', enterFullscreen: 'ملء الشاشة', dismiss: 'إخفاء',
        instancesShort: 'لقطة', ser: 'سلسلة', img: 'صورة', zoom: 'تكبير', rot: 'دوران', window: 'نافذة'
      }
    };
    let lang = translations[params.get('lang')] ? params.get('lang') : ((navigator.language || 'en').split('-')[0] === 'ar' ? 'ar' : 'en');
    const t = (key) => translations[lang]?.[key] || translations.en[key] || key;
    const state = {
      metadata: [],
      series: [],
      selectedSeriesIndex: 0,
      selectedInstanceIndex: 0,
      tab: 'summary',
      tool: 'pan',
      zoom: 1,
      rotation: 0,
      invert: false,
      contrast: 100,
      brightness: 100,
      panX: 0,
      panY: 0,
      flipX: 1,
      flipY: 1,
      dragging: false,
      dragStart: null,
      measurement: null,
      cine: null,
      renderedUnavailable: false,
      tagFilter: ''
    };

    const $ = (id) => document.getElementById(id);
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const setText = (id, text) => { const el = $(id); if (el) el.textContent = text; };
    const setTitle = (id, text) => {
      const el = $(id);
      if (!el) return;
      el.title = text;
      if (el.classList.contains('iconbtn')) {
        el.dataset.tip = text;
        el.setAttribute('aria-label', text);
      }
    };
    const setButtonLabel = (id, text) => {
      const el = $(id);
      if (!el) return;
      const label = el.querySelector('.btnLabel');
      if (label) label.textContent = text;
      else el.textContent = text;
      el.setAttribute('aria-label', text);
    };
    const setButtonIcon = (id, iconId) => {
      const use = $(id)?.querySelector('use');
      if (use) use.setAttribute('href', '#' + iconId);
    };
    const updateHud = () => {
      setText('viewHud', t('zoom') + ' ' + Math.round(state.zoom * 100) + '% | ' + t('rot') + ' ' + (state.rotation % 360) + ' | ' + t('window') + ' ' + state.contrast + '/' + state.brightness);
    };
    const applyLanguage = () => {
      document.documentElement.lang = lang;
      document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
      document.title = t('title');
      document.querySelector('.brand h1').textContent = t('title');
      document.querySelector('.sidebar h2').textContent = t('series');
      document.querySelector('.inspector h2').textContent = t('inspector');
      document.querySelector('[data-tab="summary"]').textContent = t('summary');
      document.querySelector('[data-tab="tags"]').textContent = t('tags');
      document.querySelector('[data-tab="actions"]').textContent = t('actions');
      $('seriesSearch').placeholder = t('filterSeries');
      $('languageSelect').value = lang;
      setButtonLabel('toggleSidebar', 'Toggle sidebar'); setTitle('toggleSidebar', 'Toggle sidebar');
      setButtonLabel('toolPan', t('pan')); setButtonLabel('toolMeasure', t('measure')); setButtonLabel('toggleCrosshair', t('crosshair'));
      setButtonLabel('prevInstance', t('previous')); setButtonLabel('nextInstance', t('next'));
      setButtonLabel('zoomOut', 'Zoom out'); setButtonLabel('zoomIn', 'Zoom in'); setButtonLabel('fitImage', t('fit'));
      setButtonLabel('rotateLeft', t('rotateLeft')); setButtonLabel('rotateRight', t('rotateRight'));
      setButtonLabel('flipHorizontal', t('flipH')); setButtonLabel('flipVertical', t('flipV'));
      setButtonLabel('invertImage', t('invert')); setButtonLabel('resetView', t('reset')); setButtonLabel('fullscreen', t('fullscreen'));
      setTitle('toolPan', t('pan')); setTitle('toolMeasure', t('measure')); setTitle('toggleCrosshair', t('crosshair'));
      setTitle('prevInstance', t('previous')); setTitle('nextInstance', t('next')); setTitle('playCine', state.cine ? t('pause') : t('play'));
      setTitle('zoomOut', 'Zoom out'); setTitle('zoomIn', 'Zoom in'); setTitle('fitImage', t('fit'));
      setTitle('rotateLeft', t('rotateLeft')); setTitle('rotateRight', t('rotateRight'));
      setTitle('flipHorizontal', t('flipH')); setTitle('flipVertical', t('flipV')); setTitle('invertImage', t('invert')); setTitle('resetView', t('reset')); setTitle('fullscreen', t('fullscreen'));
      setTitle('preset', t('preset')); setTitle('layoutMode', t('layout')); setTitle('languageSelect', t('language'));
      $('preset').options[0].textContent = t('default'); $('preset').options[1].textContent = t('lung'); $('preset').options[2].textContent = t('bone'); $('preset').options[3].textContent = t('brain'); $('preset').options[4].textContent = t('soft');
      $('layoutMode').options[0].textContent = t('layoutDefault'); $('layoutMode').options[1].textContent = t('layoutReview'); $('layoutMode').options[2].textContent = t('layoutFocus');
      document.querySelector('#fullscreenPrompt span').textContent = t('tabReady');
      setText('enterFullscreen', t('enterFullscreen')); setText('dismissFullscreen', t('dismiss'));
      if (!state.cine) { setButtonLabel('playCine', t('play')); setButtonIcon('playCine', 'i-play'); }
      else { setButtonLabel('playCine', t('pause')); setButtonIcon('playCine', 'i-pause'); }
      updateHud();
    };
    const tag = (item, name) => {
      const value = item?.[name]?.Value;
      if (!Array.isArray(value) || value.length === 0) return '';
      if (typeof value[0] === 'object') return value[0]?.Alphabetic || JSON.stringify(value[0]);
      return String(value[0]);
    };
    const tagAny = (item, names) => names.map((name) => tag(item, name)).find(Boolean) || '';
    const uid = (item, name) => tag(item, name);
    const renderedUrl = (instance) => '/api/pacs/dicom-web/studies/' + encodeURIComponent(studyUid)
      + '/series/' + encodeURIComponent(instance.seriesUid)
      + '/instances/' + encodeURIComponent(instance.sopUid)
      + '/rendered';

    const currentSeries = () => state.series[state.selectedSeriesIndex] || null;
    const currentInstance = () => currentSeries()?.instances[state.selectedInstanceIndex] || null;

    const setStatus = (text, kind = '') => {
      $('viewportStatus').className = kind;
      $('viewportStatus').textContent = text;
      updateHud();
    };

    const groupMetadata = (items) => {
      const map = new Map();
      items.forEach((item, index) => {
        const seriesUid = uid(item, '0020000E') || 'series-' + index;
        const sopUid = uid(item, '00080018') || 'instance-' + index;
        if (!map.has(seriesUid)) {
          map.set(seriesUid, {
            seriesUid,
            modality: tag(item, '00080060') || 'OT',
            description: tag(item, '0008103E') || 'Unnamed series',
            number: Number(tag(item, '00200011') || 999999),
            bodyPart: tag(item, '00180015'),
            instances: []
          });
        }
        map.get(seriesUid).instances.push({
          sopUid,
          seriesUid,
          number: Number(tag(item, '00200013') || index + 1),
          acquisition: tagAny(item, ['00080032', '00080022']),
          rows: tag(item, '00280010'),
          columns: tag(item, '00280011'),
          tags: item
        });
      });
      return [...map.values()]
        .sort((a, b) => a.number - b.number || a.description.localeCompare(b.description))
        .map((series) => ({ ...series, instances: series.instances.sort((a, b) => a.number - b.number) }));
    };

    const renderSeriesList = () => {
      const q = $('seriesSearch').value.trim().toLowerCase();
      $('seriesCount').textContent = state.series.length + ' ' + t('series');
      $('seriesList').innerHTML = state.series.map((series, index) => {
        const text = [series.description, series.modality, series.seriesUid].join(' ').toLowerCase();
        if (q && !text.includes(q)) return '';
        const active = index === state.selectedSeriesIndex ? ' active' : '';
        const coverInstance = series.instances[0];
        return '<div class="seriesBtn' + active + '" data-series="' + index + '" role="button" tabindex="0">'
          + '<div class="seriesCover">'
          + '<img loading="lazy" data-wado="' + renderedUrl(coverInstance) + '" alt="Series" />'
          + '<span class="badge">' + esc(series.modality) + '</span>'
          + '</div>'
          + '<div class="seriesInfo">'
          + '<div class="seriesName" title="' + esc(series.description) + '">' + esc(series.description) + '</div>'
          + '<div class="seriesMeta">' + series.instances.length + ' ' + t('instancesShort') + '</div>'
          + '</div>'
          + '</div>';
      }).join('');

      // Load cover thumbnails with Authorization header when token available
      $('seriesList').querySelectorAll('img[data-wado]').forEach(img => {
        const url = img.dataset.wado;
        if (VIARA_TOKEN) {
          fetch(url, { headers: { 'Authorization': 'Bearer ' + VIARA_TOKEN } })
            .then(r => r.ok ? r.blob() : Promise.reject())
            .then(blob => { img.src = URL.createObjectURL(blob); })
            .catch(() => { img.alt = 'Series'; });
        } else {
          img.src = url;
          img.onerror = () => { img.src = ''; img.alt = 'Series'; };
        }
      });
    };


    const applyImageTransform = () => {
      const img = document.querySelector('.dicomImg');
      if (!img) return;
      img.style.transform = 'translate(' + state.panX + 'px,' + state.panY + 'px) scale(' + (state.zoom * state.flipX) + ',' + (state.zoom * state.flipY) + ') rotate(' + state.rotation + 'deg)';
      img.style.filter = 'contrast(' + state.contrast + '%) brightness(' + state.brightness + '%)' + (state.invert ? ' invert(1)' : '');
      updateHud();
    };

    const resetView = () => {
      state.zoom = 1; state.rotation = 0; state.panX = 0; state.panY = 0; state.flipX = 1; state.flipY = 1; state.invert = false;
      state.contrast = 100; state.brightness = 100; state.measurement = null;
      $('contrast').value = 100; $('brightness').value = 100; $('preset').value = 'default';
      $('flipHorizontal').classList.remove('active'); $('flipVertical').classList.remove('active');
      renderViewport();
    };

    const renderViewport = () => {
      const series = currentSeries();
      const instance = currentInstance();
      if (!series || !instance) {
        $('imageLayer').innerHTML = '<div class="empty"><strong>' + t('noStudyTitle') + '</strong><p>' + t('noStudyLinked') + '</p></div>';
        return;
      }

      $('instanceSlider').max = Math.max(0, series.instances.length - 1);
      $('instanceSlider').value = state.selectedInstanceIndex;
      $('instanceLabel').textContent = (state.selectedInstanceIndex + 1) + '/' + series.instances.length;
      $('overlayTL').innerHTML = esc(tag(instance.tags, '00100010') || '-') + '<br>' + esc(tag(instance.tags, '00100020') || '-');
      $('overlayTR').innerHTML = esc(series.modality) + '<br>' + esc(series.description);
      $('overlayBL').innerHTML = t('ser') + ' ' + esc(tag(instance.tags, '00200011') || '-') + ' / ' + t('img') + ' ' + esc(instance.number || '-') + '<br>' + esc(instance.rows || '-') + ' x ' + esc(instance.columns || '-');
      $('overlayBR').innerHTML = esc(studyUid);
      $('viewport').classList.toggle('crosshair', $('toggleCrosshair').classList.contains('active'));

      state.renderedUnavailable = false;
      $('imageLayer').innerHTML = '<img class="dicomImg" alt="DICOM rendered instance" />';
      const img = document.querySelector('.dicomImg');

      const url = renderedUrl(instance);
      const onError = () => {
        state.renderedUnavailable = true;
        $('imageLayer').innerHTML = '<div class="empty"><strong>' + t('renderUnavailableTitle') + '</strong><p>' + t('renderUnavailableHelp') + '</p></div>';
        setStatus(t('metadataOnly'), 'warn');
      };

      if (VIARA_TOKEN) {
        // Fetch image with Authorization header, display via blob URL
        fetch(url, { headers: { 'Authorization': 'Bearer ' + VIARA_TOKEN } })
          .then(r => r.ok ? r.blob() : Promise.reject(r.status))
          .then(blob => {
            const blobUrl = URL.createObjectURL(blob);
            img.src = blobUrl;
            img.onload = () => { setStatus(t('renderedLoaded')); applyImageTransform(); URL.revokeObjectURL(blobUrl); };
            img.onerror = onError;
          })
          .catch(onError);
      } else {
        img.src = url;
        img.onload = () => { setStatus(t('renderedLoaded')); applyImageTransform(); };
        img.onerror = onError;
      }

      applyImageTransform();
      renderMeasurement();
      renderInspector();
      renderSeriesList();
    };


    const renderMeasurement = () => {
      const root = $('measurement');
      root.innerHTML = '';
      if (!state.measurement) return;
      const { x1, y1, x2, y2 } = state.measurement;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      root.innerHTML = '<div class="measureLine" style="left:' + x1 + 'px;top:' + y1 + 'px;width:' + length + 'px;transform:rotate(' + angle + 'deg)"></div>'
        + '<div class="measureLabel" style="left:' + (x2 + 8) + 'px;top:' + (y2 + 8) + 'px">' + Math.round(length) + ' px</div>';
    };

    const renderInspector = () => {
      const series = currentSeries();
      const instance = currentInstance();
      if (!series || !instance) { $('inspectorBody').innerHTML = ''; return; }

      document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === state.tab));
      if (state.tab === 'summary') {
        const fields = [
          [t('patient'), tag(instance.tags, '00100010')],
          [t('patientId'), tag(instance.tags, '00100020')],
          [t('birthDate'), tag(instance.tags, '00100030')],
          [t('accession'), tag(instance.tags, '00080050')],
          [t('studyDate'), tagAny(instance.tags, ['00080020', '00080021'])],
          [t('modality'), series.modality],
          [t('series'), series.description],
          [t('bodyPart'), series.bodyPart],
          [t('sopUid'), instance.sopUid],
          [t('seriesUid'), series.seriesUid]
        ];
        $('inspectorBody').innerHTML = fields.map(([k, v]) => '<div class="kv"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v || '-') + '</div></div>').join('');
      } else if (state.tab === 'tags') {
        const filter = state.tagFilter.trim().toLowerCase();
        const rows = Object.entries(instance.tags).sort(([a], [b]) => a.localeCompare(b)).filter(([key, value]) => {
          if (!filter) return true;
          return (key + ' ' + value.vr + ' ' + JSON.stringify(value.Value ?? '')).toLowerCase().includes(filter);
        }).map(([key, value]) =>
          '<tr><td class="mono">' + esc(key) + '</td><td>' + esc(value.vr || '') + '</td><td>' + esc(JSON.stringify(value.Value ?? '')) + '</td></tr>'
        ).join('');
        $('inspectorBody').innerHTML = '<input class="search" id="tagSearch" placeholder="' + t('searchTags') + '" value="' + esc(state.tagFilter) + '" />'
          + '<table class="tagtable" style="margin-top:10px"><tbody>' + (rows || '<tr><td>' + t('noMatchingTags') + '</td></tr>') + '</tbody></table>';
        $('tagSearch')?.addEventListener('input', (event) => { state.tagFilter = event.target.value; renderInspector(); });
      } else {
        $('inspectorBody').innerHTML =
          '<div class="kv"><div class="k">' + t('rendered') + '</div><div class="v"><a class="mono" target="_blank" rel="noopener" href="' + renderedUrl(instance) + '">' + t('openImage') + '</a></div></div>'
          + '<div class="kv"><div class="k">' + t('metadata') + '</div><div class="v"><a class="mono" target="_blank" rel="noopener" href="/api/pacs/dicom-web/studies/' + encodeURIComponent(studyUid) + '/metadata">' + t('openJson') + '</a></div></div>'
          + '<div class="kv"><div class="k">' + t('state') + '</div><div class="v">' + esc(state.renderedUnavailable ? t('metadataOnly') : t('imageRendered')) + '</div></div>'
          + '<div class="actionGrid">'
          + '<button class="actionBtn" data-copy="' + esc(studyUid) + '">' + t('copyStudy') + '</button>'
          + '<button class="actionBtn" data-copy="' + esc(series.seriesUid) + '">' + t('copySeries') + '</button>'
          + '<button class="actionBtn" data-copy="' + esc(instance.sopUid) + '">' + t('copyInstance') + '</button>'
          + '</div>';
      }
    };

    const selectInstance = (seriesIndex, instanceIndex) => {
      state.selectedSeriesIndex = Math.max(0, Math.min(seriesIndex, state.series.length - 1));
      const series = currentSeries();
      state.selectedInstanceIndex = Math.max(0, Math.min(instanceIndex, (series?.instances.length || 1) - 1));
      state.measurement = null;
      renderViewport();
    };

    const stepInstance = (delta) => {
      const series = currentSeries();
      if (!series) return;
      const next = (state.selectedInstanceIndex + delta + series.instances.length) % series.instances.length;
      selectInstance(state.selectedSeriesIndex, next);
    };

    const setTool = (tool) => {
      state.tool = tool;
      $('toolPan').classList.toggle('active', tool === 'pan');
      $('toolMeasure').classList.toggle('active', tool === 'measure');
    };

    const stopCine = () => {
      if (state.cine) clearInterval(state.cine);
      state.cine = null;
      $('playCine').classList.remove('active');
      setButtonLabel('playCine', t('play'));
      setButtonIcon('playCine', 'i-play');
      setTitle('playCine', t('play'));
    };

    const loadStudy = async () => {
      $('studyUidLabel').textContent = studyUid || t('studyUidMissing');
      if (!studyUid) {
        $('patientName').textContent = t('noStudyTitle');
        $('imageLayer').innerHTML = '<div class="empty"><strong>' + t('noStudyTitle') + '</strong><p>' + t('noStudyHelp') + '</p></div>';
        setStatus(t('noStudyUid'), 'danger');
        return;
      }
      try {
        setStatus(t('loadingMetadata'));
        const fetchOpts = VIARA_TOKEN
          ? { headers: { 'Authorization': 'Bearer ' + VIARA_TOKEN }, cache: 'no-store' }
          : { credentials: 'include', cache: 'no-store' };
        const res = await fetch('/api/pacs/dicom-web/studies/' + encodeURIComponent(studyUid) + '/metadata', fetchOpts);
        if (!res.ok) throw new Error(await res.text() || ('HTTP ' + res.status));
        state.metadata = await res.json();
        state.series = groupMetadata(Array.isArray(state.metadata) ? state.metadata : []);
        if (!state.series.length) throw new Error(t('noMetadata'));
        const first = state.series[0].instances[0].tags;
        $('patientName').textContent = tag(first, '00100010') || t('unknownPatient');
        $('patientLine').textContent = 'MRN ' + (tag(first, '00100020') || '-') + ' | ACC ' + (tag(first, '00080050') || '-');
        selectInstance(0, 0);
      } catch (error) {
        $('patientName').textContent = t('viewerUnavailable');
        $('patientLine').textContent = '';
        $('imageLayer').innerHTML = '<div class="empty"><strong>' + t('couldNotLoad') + '</strong><p>' + esc(error.message) + '</p></div>';
        setStatus(t('loadFailed'), 'danger');
      }
    };

    $('seriesList').addEventListener('click', (event) => {
      const thumb = event.target.closest('.thumb');
      if (thumb) { event.stopPropagation(); selectInstance(Number(thumb.dataset.series), Number(thumb.dataset.instance)); return; }
      const btn = event.target.closest('.seriesBtn');
      if (btn) selectInstance(Number(btn.dataset.series), 0);
    });
    $('seriesSearch').addEventListener('input', renderSeriesList);
    $('instanceSlider').addEventListener('input', (e) => selectInstance(state.selectedSeriesIndex, Number(e.target.value)));
    $('prevInstance').addEventListener('click', () => stepInstance(-1));
    $('nextInstance').addEventListener('click', () => stepInstance(1));
    $('playCine').addEventListener('click', () => {
      if (state.cine) { stopCine(); return; }
      $('playCine').classList.add('active');
      setButtonLabel('playCine', t('pause'));
      setButtonIcon('playCine', 'i-pause');
      setTitle('playCine', t('pause'));
      state.cine = setInterval(() => stepInstance(1), Math.max(60, 1000 / Number($('cineSpeed').value || 5)));
    });
    $('cineSpeed').addEventListener('change', () => { if (state.cine) { stopCine(); $('playCine').click(); } });
    $('zoomIn').addEventListener('click', () => { state.zoom = Math.min(8, state.zoom + .15); applyImageTransform(); });
    $('zoomOut').addEventListener('click', () => { state.zoom = Math.max(.15, state.zoom - .15); applyImageTransform(); });
    $('fitImage').addEventListener('click', () => { state.zoom = 1; state.panX = 0; state.panY = 0; applyImageTransform(); });
    $('rotateLeft').addEventListener('click', () => { state.rotation -= 90; applyImageTransform(); });
    $('rotateRight').addEventListener('click', () => { state.rotation += 90; applyImageTransform(); });
    $('flipHorizontal').addEventListener('click', () => { state.flipX *= -1; $('flipHorizontal').classList.toggle('active', state.flipX < 0); applyImageTransform(); });
    $('flipVertical').addEventListener('click', () => { state.flipY *= -1; $('flipVertical').classList.toggle('active', state.flipY < 0); applyImageTransform(); });
    $('invertImage').addEventListener('click', () => { state.invert = !state.invert; $('invertImage').classList.toggle('active', state.invert); applyImageTransform(); });
    $('resetView').addEventListener('click', resetView);
    $('toggleSidebar').addEventListener('click', () => {
      const isMobile = window.innerWidth <= 640;
      const shell = document.querySelector('.shell');
      if (isMobile) {
        shell.classList.toggle('sidebar-mobile-open');
      } else {
        shell.classList.toggle('sidebar-collapsed');
      }
      $('toggleSidebar').classList.toggle('active');
    });
    $('fullscreen').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else $('viewport').requestFullscreen?.();
    });
    $('contrast').addEventListener('input', (e) => { state.contrast = Number(e.target.value); applyImageTransform(); });
    $('brightness').addEventListener('input', (e) => { state.brightness = Number(e.target.value); applyImageTransform(); });
    $('preset').addEventListener('change', (e) => {
      const presets = { default: [100,100], lung: [165,115], bone: [190,120], brain: [125,100], soft: [110,105] };
      [state.contrast, state.brightness] = presets[e.target.value] || presets.default;
      $('contrast').value = state.contrast; $('brightness').value = state.brightness; applyImageTransform();
    });
    $('layoutMode').addEventListener('change', (event) => {
      document.querySelector('.shell').classList.toggle('layout-focus', event.target.value === 'focus');
      document.querySelector('.shell').classList.toggle('layout-noInspector', event.target.value === 'noInspector');
    });
    $('languageSelect').addEventListener('change', (event) => {
      lang = event.target.value === 'ar' ? 'ar' : 'en';
      params.set('lang', lang);
      history.replaceState(null, '', location.pathname + '?' + params.toString());
      applyLanguage();
      renderViewport();
    });
    $('toolPan').addEventListener('click', () => setTool('pan'));
    $('toolMeasure').addEventListener('click', () => setTool('measure'));
    $('toggleCrosshair').addEventListener('click', () => { $('toggleCrosshair').classList.toggle('active'); $('viewport').classList.toggle('crosshair'); });
    document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => { state.tab = tab.dataset.tab; renderInspector(); }));
    $('inspectorBody').addEventListener('click', async (event) => {
      const copyBtn = event.target.closest('[data-copy]');
      if (!copyBtn) return;
      try {
        await navigator.clipboard.writeText(copyBtn.dataset.copy || '');
        setStatus(t('copied'));
      } catch {
        setStatus(t('copyFailed'), 'warn');
      }
    });
    $('enterFullscreen').addEventListener('click', async () => {
      await document.documentElement.requestFullscreen?.();
      $('fullscreenPrompt').hidden = true;
    });
    $('dismissFullscreen').addEventListener('click', () => { $('fullscreenPrompt').hidden = true; });

    $('viewport').addEventListener('pointerdown', (event) => {
      $('viewport').setPointerCapture(event.pointerId);
      state.dragging = true;
      state.dragStart = { x: event.clientX, y: event.clientY, panX: state.panX, panY: state.panY };
      if (state.tool === 'measure') {
        const rect = $('viewport').getBoundingClientRect();
        state.measurement = { x1: event.clientX - rect.left, y1: event.clientY - rect.top, x2: event.clientX - rect.left, y2: event.clientY - rect.top };
        renderMeasurement();
      }
    });
    $('viewport').addEventListener('pointermove', (event) => {
      if (!state.dragging || !state.dragStart) return;
      if (state.tool === 'measure' && state.measurement) {
        const rect = $('viewport').getBoundingClientRect();
        state.measurement.x2 = event.clientX - rect.left;
        state.measurement.y2 = event.clientY - rect.top;
        renderMeasurement();
      } else {
        state.panX = state.dragStart.panX + event.clientX - state.dragStart.x;
        state.panY = state.dragStart.panY + event.clientY - state.dragStart.y;
        applyImageTransform();
      }
    });
    $('viewport').addEventListener('pointerup', () => { state.dragging = false; state.dragStart = null; });
    $('viewport').addEventListener('wheel', (event) => {
      event.preventDefault();
      if (event.ctrlKey) {
        state.zoom = Math.max(.15, Math.min(8, state.zoom + (event.deltaY < 0 ? .12 : -.12)));
        applyImageTransform();
      } else {
        stepInstance(event.deltaY > 0 ? 1 : -1);
      }
    }, { passive: false });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') stepInstance(1);
      if (event.key === 'ArrowLeft') stepInstance(-1);
      if (event.key === ' ') { event.preventDefault(); $('playCine').click(); }
      if (event.key.toLowerCase() === 'r') resetView();
      if (event.key.toLowerCase() === 'm') setTool('measure');
      if (event.key.toLowerCase() === 'p') setTool('pan');
    });

    applyLanguage();
    setStatus(t('initializing'));
    loadStudy();
    if (shouldPromptFullscreen) $('fullscreenPrompt').hidden = false;
  </script>
</body>
</html>`;

const proxyApi = (req, res) => {
  const target = new URL(req.url, BACKEND_URL);
  const headers = { ...req.headers, host: target.host };
  delete headers.origin;
  delete headers.referer;
  // Forward Authorization header if present (Bearer token from VIARA_token param injected by viewer)
  const upstream = http.request(target, { method: req.method, headers }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on('error', (error) => {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: `Backend proxy failed: ${error.message}` }));
  });
  req.pipe(upstream);
};

http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    proxyApi(req, res);
    return;
  }
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': "frame-ancestors http://localhost:5173"
  });
  res.end(html);
}).listen(PORT, HOST, () => {
  console.log(`VIARA PACS fallback viewer listening on http://${HOST}:${PORT}`);
});
