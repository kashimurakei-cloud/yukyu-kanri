// プロトタイプのデザインを流用した共通スタイル
export const ink = "#1f2421";
export const paper = "#f6f4ef";
export const accent = "#3a7d6e";
export const accentSoft = "#e3efea";
export const line = "#e2ded5";

export const S = {
  page: { minHeight: "100vh", background: paper, color: ink, fontFamily: "'Zen Kaku Gothic New', sans-serif" },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-end",
    padding: "28px 24px 20px", maxWidth: 920, margin: "0 auto", flexWrap: "wrap", gap: 16,
  },
  brandEyebrow: { fontSize: 12, letterSpacing: "0.18em", color: accent, fontWeight: 700 },
  brandTitle: { fontSize: 30, fontWeight: 800, margin: "4px 0 0", letterSpacing: "0.02em" },
  userBox: { display: "flex", alignItems: "center", gap: 12 },
  userName: { fontSize: 14, color: "#6a665e" },
  main: { maxWidth: 920, margin: "0 auto", padding: "16px 24px 60px" },

  heroCard: {
    background: `linear-gradient(135deg, ${accent}, #2f6358)`, color: "#fff",
    borderRadius: 18, padding: "26px 28px", marginBottom: 18,
    boxShadow: "0 10px 30px rgba(47,99,88,0.22)",
  },
  heroLabel: { fontSize: 13, opacity: 0.85, letterSpacing: "0.08em" },
  heroValue: { fontSize: 40, fontWeight: 800, margin: "6px 0", lineHeight: 1.1 },
  heroDayUnit: { fontSize: 20, fontWeight: 700, marginLeft: 4 },
  heroSub: { fontSize: 13.5, fontWeight: 500, opacity: 0.82, marginLeft: 12 },
  heroMeta: { fontSize: 13.5, opacity: 0.92, display: "flex", gap: 8, flexWrap: "wrap" },
  dot: { opacity: 0.5 },
  forecastBox: { background: "rgba(255,255,255,0.14)", borderRadius: 12, padding: "10px 14px", margin: "4px 0 14px" },
  forecastRow: { display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "3px 0" },
  forecastMinus: { color: "#ffd2c8" },
  warnTag: { background: "#fdecea", color: "#b4341f", padding: "1px 7px", borderRadius: 20, fontSize: 11, fontWeight: 700, marginLeft: 6 },
  cautionTag: { background: "#fbf0db", color: "#b07a1f", padding: "1px 7px", borderRadius: 20, fontSize: 11, fontWeight: 700, marginLeft: 6 },
  affectRow: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13.5, padding: "6px 10px", background: "#fff", borderRadius: 8, border: `1px solid ${line}` },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 },
  modalCard: { background: "#fff", borderRadius: 16, padding: "24px 26px", width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" },

  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 },
  card: { background: "#fff", border: `1px solid ${line}`, borderRadius: 16, padding: "20px 22px", marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: 700, margin: "0 0 14px" },
  subTitle: { fontSize: 14, fontWeight: 700, margin: "4px 0 10px", color: "#4a4a44" },

  fieldLabel: { display: "block", fontSize: 13, fontWeight: 600, margin: "12px 0 6px", color: "#4a4a44" },
  hint: { display: "block", fontWeight: 400, fontSize: 11.5, color: accent, marginTop: 2 },
  input: {
    width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${line}`,
    fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", background: "#fcfbf9",
  },
  btnPrimary: {
    marginTop: 16, width: "100%", padding: "12px", borderRadius: 10, border: "none",
    background: accent, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  },
  btnGhost: {
    padding: "6px 12px", borderRadius: 8, border: `1px solid ${line}`, background: "#fff",
    fontSize: 12.5, cursor: "pointer", fontFamily: "inherit",
  },
  noteSmall: { fontSize: 11.5, color: "#9a9488", marginTop: 10, lineHeight: 1.5 },

  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5 },
  th: { textAlign: "left", padding: "8px 6px", borderBottom: `2px solid ${line}`, color: "#8a857a", fontWeight: 600, fontSize: 12 },
  thR: { textAlign: "right", padding: "8px 6px", borderBottom: `2px solid ${line}`, color: "#8a857a", fontWeight: 600, fontSize: 12 },
  td: { padding: "9px 6px", borderBottom: `1px solid ${line}` },
  tdR: { padding: "9px 6px", borderBottom: `1px solid ${line}`, textAlign: "right" },
  tdBold: { padding: "9px 6px", borderBottom: `1px solid ${line}`, fontWeight: 700 },
  tdMemo: { padding: "9px 6px", borderBottom: `1px solid ${line}`, color: "#6a665e" },
  empty: { fontSize: 13.5, color: "#9a9488", padding: "8px 0" },
  minSub: { fontSize: 11, color: "#9a9488", marginLeft: 4, fontWeight: 400 },

  tagNormal: { background: accentSoft, color: accent, padding: "2px 8px", borderRadius: 20, fontSize: 11.5, fontWeight: 600 },
  tagPlan: { background: "#fdeede", color: "#bf6a23", padding: "2px 8px", borderRadius: 20, fontSize: 11.5, fontWeight: 600 },
  tagActive: { background: accentSoft, color: accent, padding: "2px 8px", borderRadius: 20, fontSize: 11.5, fontWeight: 600 },
  tagExpired: { background: "#f0eeea", color: "#a09a8e", padding: "2px 8px", borderRadius: 20, fontSize: 11.5, fontWeight: 600 },

  tabBar: { display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap", alignItems: "center" },
  tab: {
    padding: "9px 15px", borderRadius: 999, border: "1px solid transparent",
    background: "transparent", fontSize: 13.5, cursor: "pointer", fontFamily: "inherit",
    color: "#6a665e", fontWeight: 600,
  },
  tabActive: {
    padding: "9px 15px", borderRadius: 999, border: `1px solid ${accent}`,
    background: accent, color: "#fff", fontSize: 13.5, cursor: "pointer",
    fontFamily: "inherit", fontWeight: 800,
    boxShadow: "0 3px 10px rgba(58,125,110,0.3)",
  },
  badge: { marginLeft: 6, background: "#e5484d", color: "#fff", borderRadius: 20, padding: "1px 7px", fontSize: 11, fontWeight: 800 },

  quickRow: { display: "flex", gap: 8, margin: "0 0 8px", flexWrap: "wrap" },
  quickBtn: { flex: 1, padding: "8px", borderRadius: 9, border: `1px solid ${line}`, background: accentSoft, color: accent, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  quickBtnOn: { flex: 1, padding: "8px", borderRadius: 9, border: `1px solid ${accent}`, background: accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },

  notifHead: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  notifList: { listStyle: "none", padding: 0, margin: 0 },
  notifItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 4px", borderBottom: `1px solid ${line}`, fontSize: 14 },
  notifItemUnread: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 10px", borderBottom: `1px solid ${line}`, fontSize: 14, background: accentSoft, borderRadius: 8 },
  notifMeta: { fontSize: 12, color: "#8a857a", marginTop: 2 },
  unreadDot: { width: 9, height: 9, borderRadius: "50%", background: accent, flexShrink: 0 },

  preview: { marginTop: 14, padding: 14, background: "#fbfaf7", border: `1px dashed ${line}`, borderRadius: 12 },
  previewLabel: { fontSize: 12, fontWeight: 600, color: "#8a857a", marginBottom: 8 },
  chips: { display: "flex", flexWrap: "wrap", gap: 8 },
  chip: { background: accentSoft, color: accent, padding: "5px 12px", borderRadius: 20, fontSize: 12.5, fontWeight: 600 },

  plainList: { listStyle: "none", padding: 0, margin: 0 },
  plainItem: { display: "flex", gap: 12, alignItems: "center", padding: "10px 4px", borderBottom: `1px solid ${line}` },
  plainMemo: { color: "#6a665e", fontSize: 13.5 },

  linkBtn: { padding: "5px 10px", borderRadius: 8, border: `1px solid ${accent}`, background: "#fff", color: accent, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  histSummary: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, margin: "0 0 18px" },
  histStat: { background: "#fbfaf7", border: `1px solid ${line}`, borderRadius: 12, padding: "12px 10px", textAlign: "center" },
  histStatLabel: { fontSize: 11.5, color: "#8a857a", marginBottom: 4 },
  histStatValue: { fontSize: 17, fontWeight: 800, color: ink },
  histStatSub: { fontSize: 11, color: "#9a9488", marginTop: 2 },

  // ログイン画面
  loginWrap: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: paper, padding: 20 },
  loginCard: { width: "100%", maxWidth: 380, background: "#fff", border: `1px solid ${line}`, borderRadius: 18, padding: "32px 28px", boxShadow: "0 10px 40px rgba(0,0,0,0.06)" },
  loginEyebrow: { fontSize: 12, letterSpacing: "0.18em", color: accent, fontWeight: 700, textAlign: "center" },
  loginTitle: { fontSize: 24, fontWeight: 800, margin: "6px 0 24px", textAlign: "center" },
  errorBox: { background: "#fdecea", color: "#b4341f", padding: "10px 12px", borderRadius: 10, fontSize: 13, marginTop: 12, lineHeight: 1.5 },
  linkText: { color: accent, fontSize: 12.5, cursor: "pointer", textDecoration: "underline", background: "none", border: "none", fontFamily: "inherit", marginTop: 14, padding: 0 },
};

export const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700;900&display=swap');
  * { box-sizing: border-box; }
  body { margin: 0; -webkit-font-smoothing: antialiased; }
  button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid ${accent}; outline-offset: 2px; }
  button { -webkit-tap-highlight-color: transparent; }
  @media (max-width: 640px) {
    .grid2 { grid-template-columns: 1fr !important; }
    .histSummary { grid-template-columns: 1fr 1fr !important; }
  }

  /* ===== 年次有給休暇管理簿の印刷 ===== */
  .yk-print { display: none; }
  @media print {
    @page { size: A4 portrait; margin: 12mm; }
    body { background: #fff !important; }
    body > *:not(.yk-print) { display: none !important; }
    .yk-print {
      display: block; width: 100%;
      -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
      font-family: 'Zen Kaku Gothic New', sans-serif; color: #000;
    }
    .yk-print-page { page-break-after: always; }
    .yk-print-page:last-child { page-break-after: auto; }
    .yk-print-head {
      display: flex; justify-content: space-between; align-items: baseline;
      border-bottom: 2px solid #157F71; padding-bottom: 2mm; margin-bottom: 4mm;
    }
    .yk-print-title { font-size: 17px; font-weight: 900; letter-spacing: 1px; }
    .yk-print-date { font-size: 10px; color: #444; }
    .yk-print-meta { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
    .yk-print-meta th {
      background: #eef5f3; font-size: 9.5px; font-weight: 700; text-align: left;
      padding: 1.6mm 2mm; border: 0.5px solid #b9cdc8; width: 16mm; white-space: nowrap;
    }
    .yk-print-meta td { font-size: 10.5px; padding: 1.6mm 2mm; border: 0.5px solid #b9cdc8; }
    .yk-print-meta td.yk-name { font-size: 13px; font-weight: 800; }
    .yk-print-table { width: 100%; border-collapse: collapse; }
    .yk-print-table th {
      background: #157F71; color: #fff; font-size: 9.5px; font-weight: 700;
      padding: 1.6mm 2mm; text-align: left;
    }
    .yk-print-table td { font-size: 10px; padding: 1.4mm 2mm; border-bottom: 0.5px solid #ccc; }
    .yk-print-table .c-no { width: 7mm; text-align: center; color: #888; }
    .yk-print-table .c-r, .yk-print-table th.c-r { text-align: right; }
    .yk-print-table .c-empty { color: #999; text-align: center; padding: 4mm; }
    .yk-print-sum { width: 100%; border-collapse: collapse; margin-top: 4mm; }
    .yk-print-sum th {
      background: #eef5f3; font-size: 9.5px; font-weight: 700; text-align: left;
      padding: 1.8mm 2mm; border: 0.5px solid #b9cdc8; white-space: nowrap;
    }
    .yk-print-sum td { font-size: 10.5px; padding: 1.8mm 2mm; border: 0.5px solid #b9cdc8; }
    .yk-print-sum td.yk-strong { font-weight: 900; font-size: 12px; }
    .yk-print-note { font-size: 8.5px; color: #666; margin-top: 3mm; }
  }
`;
