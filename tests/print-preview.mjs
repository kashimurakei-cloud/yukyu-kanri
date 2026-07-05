// jsdomでOwnerViewを実描画して管理簿HTMLを取得
import esbuild from "esbuild";
import { JSDOM } from "jsdom";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const today = new Date(); today.setHours(0,0,0,0);
const iso = (d) => d.toISOString().slice(0,10);
const monthsAgo = (n) => { const d = new Date(today); d.setMonth(d.getMonth()-n); return iso(d); };
const daysFrom = (n) => { const d = new Date(today); d.setDate(d.getDate()+n); return iso(d); };

const MPD = { sun:0, mon:480, tue:480, wed:480, thu:0, fri:480, sat:300 };
const staffA = { id:"u-a", name:"佐藤 花子", role:"staff", joinDate: monthsAgo(20), workDaysPerWeek:5, dailyMinutes:480, minutesPerDay:MPD };
const staffB = { id:"u-b", name:"鈴木 美咲", role:"staff", joinDate: monthsAgo(28), workDaysPerWeek:4, dailyMinutes:420, minutesPerDay:{...MPD, mon:0} };
const owner = { id:"u-owner", name:"院長", role:"owner", joinDate:"2010-04-01", workDaysPerWeek:5, dailyMinutes:480, minutesPerDay:MPD };

globalThis.__DB = {
  "staff": [owner, staffA, staffB],
  "staff/u-a/leaveRecords": [
    { id:"ra1", date: daysFrom(-40), minutes:480, type:"normal", memo:"私用" },
    { id:"ra2", date: daysFrom(-10), minutes:260, type:"normal", memo:"午前" },
    { id:"ra3", date: daysFrom(12), minutes:480, type:"normal", memo:"旅行" },
  ],
  "staff/u-b/leaveRecords": [
    { id:"rb1", date: daysFrom(-100), minutes:420, type:"normal", memo:"" },
    { id:"rb2", date: daysFrom(12), minutes:420, type:"normal", memo:"通院" },
  ],
  "notifications": [],
  "plannedLeaves": [ { id:"p1", date: daysFrom(20), memo:"院内研修日", status:"pending" } ],
};
globalThis.__AUTH_UID = "u-owner";

const stubs = {
  "local-firebase": `
    export const db = {};
    export const auth = {};
    export const login = async () => ({});
    export const logout = async () => {};
    export const resetPassword = async () => {};
    export const watchAuth = (cb) => { setTimeout(() => cb({ uid: globalThis.__AUTH_UID }), 0); return () => {}; };
  `,
  "firebase/firestore": `
    const seg = (a) => a.filter((x) => typeof x === "string").join("/");
    export const doc = (...a) => ({ __t: "doc", path: seg(a.slice(1)) });
    export const collection = (...a) => ({ __t: "col", path: seg(a.slice(1)) });
    export const query = (c) => c;
    export const orderBy = () => null;
    export const serverTimestamp = () => 0;
    export const getDoc = async (d) => {
      const parts = d.path.split("/");
      const col = parts.slice(0, -1).join("/"); const id = parts[parts.length-1];
      const row = (globalThis.__DB[col] || []).find((x) => x.id === id);
      return { exists: () => !!row, id, data: () => { const { id: _i, ...rest } = row || {}; return rest; } };
    };
    export const getDocs = async (c) => ({
      docs: (globalThis.__DB[c.path] || []).map((r) => ({ id: r.id, data: () => { const { id, ...rest } = r; return rest; } })),
    });
    let n = 0;
    export const addDoc = async (c, data) => {
      const id = "gen" + (++n);
      (globalThis.__DB[c.path] = globalThis.__DB[c.path] || []).push({ id, ...data });
      return { id };
    };
    export const setDoc = async (d, data) => {};
    export const updateDoc = async (d, patch) => {
      const parts = d.path.split("/");
      const col = parts.slice(0, -1).join("/"); const id = parts[parts.length-1];
      const row = (globalThis.__DB[col] || []).find((x) => x.id === id);
      if (row) Object.assign(row, patch);
    };
    export const deleteDoc = async (d) => {
      const parts = d.path.split("/");
      const col = parts.slice(0, -1).join("/"); const id = parts[parts.length-1];
      globalThis.__DB[col] = (globalThis.__DB[col] || []).filter((x) => x.id !== id);
    };
  `,
};
const entry = `
import React from "react";
import { createRoot } from "react-dom/client";
import App from ${JSON.stringify(path.join(ROOT, "src", "App.jsx"))};
globalThis.__renderApp = (el) => { createRoot(el).render(React.createElement(App)); };
`;
const stubPlugin = {
  name: "stubs",
  setup(build) {
    build.onResolve({ filter: /^firebase\// }, (a) => ({ path: a.path === "firebase/firestore" ? "firebase/firestore" : "firebase/app", namespace: "stub" }));
    build.onResolve({ filter: /\.\.?\/firebase$/ }, () => ({ path: "local-firebase", namespace: "stub" }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({
      contents: stubs[a.path] || `export const initializeApp = () => ({}); export const getAuth = () => ({});`,
      loader: "js",
    }));
    build.onResolve({ filter: /^__entry__$/ }, () => ({ path: "__entry__", namespace: "entry" }));
    build.onLoad({ filter: /.*/, namespace: "entry" }, () => ({ contents: entry, loader: "jsx", resolveDir: ROOT }));
  },
};
const built = await esbuild.build({
  entryPoints: ["__entry__"], bundle: true, write: false, format: "iife",
  jsx: "automatic", plugins: [stubPlugin], define: { "process.env.NODE_ENV": '"test"' },
  platform: "browser", supported: { "import-meta": true },
});

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, { url: "https://example.com/" });
globalThis.window = dom.window; globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.localStorage = dom.window.localStorage;
globalThis.alert = () => {}; dom.window.alert = () => {}; dom.window.confirm = () => true;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
eval(built.outputFiles[0].text);
globalThis.__renderApp(dom.window.document.getElementById("root"));
await wait(900);

const printEl = dom.window.document.querySelector(".yk-print");
if (!printEl) { console.log("NO .yk-print FOUND"); process.exit(1); }
const css = fs.readFileSync("/tmp/yk-css.css", "utf8");
fs.writeFileSync("/tmp/yk-ledger.html",
  `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${printEl.outerHTML}</body></html>`);
console.log("captured ledger,", printEl.querySelectorAll(".yk-print-page").length, "pages");
process.exit(0);
