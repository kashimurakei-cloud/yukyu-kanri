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

  tabBar: { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  tab: { padding: "9px 16px", borderRadius: 10, border: `1px solid ${line}`, background: "#fff", fontSize: 14, cursor: "pointer", fontFamily: "inherit", color: "#6a665e" },
  tabActive: { padding: "9px 16px", borderRadius: 10, border: `1px solid ${accent}`, background: accent, color: "#fff", fontSize: 14, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 },
  badge: { marginLeft: 6, background: "#fff", color: accent, borderRadius: 20, padding: "0 7px", fontSize: 11, fontWeight: 700 },

  quickRow: { display: "flex", gap: 8, margin: "0 0 8px", flexWrap: "wrap" },
  quickBtn: { flex: 1, padding: "8px", borderRadius: 9, border: `1px solid ${line}`, background: accentSoft, color: accent, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },

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
  body { margin: 0; }
  button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid ${accent}; outline-offset: 2px; }
  @media (max-width: 640px) {
    .grid2 { grid-template-columns: 1fr !important; }
    .histSummary { grid-template-columns: 1fr 1fr !important; }
  }
`;
