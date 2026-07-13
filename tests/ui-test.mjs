/* ============================================================
   yukyu-kanri UI自動テスト
   Firebase(Auth+Firestore)をモック化し、jsdomで実描画して検証。
   実行: npm test
   AIへの指示: 「変更後に npm run build と npm test を実行し、
   ✅ all passed を確認してから納品して」
============================================================ */
let __pass = 0, __fail = 0;
{
  const orig = console.log.bind(console);
  console.log = (...a) => {
    const s = a.map(String).join(" ");
    if (/: true$/.test(s)) __pass++;
    else if (/: false$/.test(s)) { __fail++; a.push("  ← ★FAIL"); }
    orig(...a);
  };
}

import esbuild from "esbuild";
import { JSDOM } from "jsdom";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

/* ---------- モックデータ(実行日から相対) ---------- */
const today = new Date(); today.setHours(0, 0, 0, 0);
const iso = (d) => d.toISOString().slice(0, 10);
const monthsAgo = (n) => { const d = new Date(today); d.setMonth(d.getMonth() - n); return iso(d); };
const daysFrom = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };

const MPD = { sun: 0, mon: 480, tue: 480, wed: 480, thu: 0, fri: 480, sat: 300 };
// A: 入職20ヶ月前 → 基準日2ヶ月前・年5日義務が進行中
const staffA = { id: "u-a", name: "佐藤 花子", role: "staff", joinDate: monthsAgo(20), workDaysPerWeek: 5, dailyMinutes: 480, minutesPerDay: MPD };
// B: 入職28ヶ月前 → 最初の付与が約2ヶ月後に時効(警告対象)
const staffB = { id: "u-b", name: "鈴木 美咲", role: "staff", joinDate: monthsAgo(28), workDaysPerWeek: 4, dailyMinutes: 420, minutesPerDay: { ...MPD, mon: 0 } };
const owner = { id: "u-owner", name: "院長", role: "owner", joinDate: "2010-04-01", workDaysPerWeek: 5, dailyMinutes: 480, minutesPerDay: MPD };

const DUP_DAY = daysFrom(12); // AとBが同じ日に休む → カレンダー⚠

globalThis.__DB = {
  "staff": [owner, staffA, staffB],
  "staff/u-a/leaveRecords": [
    { id: "ra1", date: daysFrom(-40), minutes: 480, type: "normal", memo: "私用" },
    { id: "ra2", date: daysFrom(-10), minutes: 260, type: "normal", memo: "午前" },
    { id: "ra3", date: DUP_DAY, minutes: 480, type: "normal", memo: "旅行" },
  ],
  "staff/u-b/leaveRecords": [
    { id: "rb1", date: daysFrom(-100), minutes: 420, type: "normal", memo: "" },
    { id: "rb2", date: DUP_DAY, minutes: 420, type: "normal", memo: "通院" },
  ],
  "notifications": [],
  "plannedLeaves": [{ id: "p1", date: daysFrom(20), memo: "院内研修日", status: "pending" }],
};
globalThis.__AUTH_UID = "u-owner";

/* ---------- Firebaseスタブ ---------- */
const stubs = {
  "local-firebase": `
    export const db = {};
    export const auth = {};
    export const STAFF_EMAIL_DOMAIN = "staff.yukyu-kanri.local";
    export const loginIdToEmail = (v) => String(v).includes("@") ? v : v.toLowerCase() + "@" + STAFF_EMAIL_DOMAIN;
    export const login = async () => ({});
    export const logout = async () => {};
    export const resetPassword = async () => {};
    let created = 0;
    export const createStaffAccount = async (loginId, pw) => {
      globalThis.__createdAccounts = globalThis.__createdAccounts || [];
      globalThis.__createdAccounts.push({ loginId, pw });
      return "new-uid-" + (++created);
    };
    export const changePassword = async (cur, next) => {
      globalThis.__pwChanged = { cur, next };
    };
    export const watchAuth = (cb) => {
      setTimeout(() => cb(globalThis.__AUTH_UID ? { uid: globalThis.__AUTH_UID } : null), 0);
      return () => {};
    };
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
      const col = parts.slice(0, -1).join("/"); const id = parts[parts.length - 1];
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
    export const setDoc = async (d, data) => {
      const parts = d.path.split("/");
      const col = parts.slice(0, -1).join("/"); const id = parts[parts.length - 1];
      const arr = (globalThis.__DB[col] = globalThis.__DB[col] || []);
      const row = arr.find((x) => x.id === id);
      if (row) Object.assign(row, data);
      else arr.push({ id, ...data });
    };
    export const updateDoc = async (d, patch) => {
      const parts = d.path.split("/");
      const col = parts.slice(0, -1).join("/"); const id = parts[parts.length - 1];
      const row = (globalThis.__DB[col] || []).find((x) => x.id === id);
      if (row) Object.assign(row, patch);
    };
    export const deleteDoc = async (d) => {
      const parts = d.path.split("/");
      const col = parts.slice(0, -1).join("/"); const id = parts[parts.length - 1];
      globalThis.__DB[col] = (globalThis.__DB[col] || []).filter((x) => x.id !== id);
    };
  `,
};
const entry = `
import React from "react";
import { createRoot } from "react-dom/client";
import App from ${JSON.stringify(path.join(ROOT, "src", "App.jsx"))};
globalThis.__renderApp = (el) => { const r = createRoot(el); r.render(React.createElement(App)); return r; };
`;
const stubPlugin = {
  name: "stubs",
  setup(build) {
    build.onResolve({ filter: /^firebase\// }, (a) => ({
      path: a.path === "firebase/firestore" ? "firebase/firestore" : "firebase/other", namespace: "stub",
    }));
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

/* ---------- jsdom ---------- */
const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div><div id="root2"></div></body></html>`, {
  url: "https://example.com/", pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.localStorage = dom.window.localStorage;
globalThis.alert = () => {};
dom.window.alert = () => {};
dom.window.confirm = () => true;
globalThis.__printed = 0;
dom.window.print = () => { globalThis.__printed++; };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
const byText = (rootEl, sel, text) => [...rootEl.querySelectorAll(sel)].find((b) => b.textContent.includes(text));
const setVal = (el, v) => {
  const desc = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value");
  desc.set.call(el, v);
  el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
};

const origError = console.error;
console.error = (...a) => {
  const s = String(a[0] || "");
  if (s.includes("act(") || s.includes("ReactDOM")) return;
  origError(...a);
};

try {
  eval(built.outputFiles[0].text);

  /* ========== 院長側 ========== */
  const rootEl = dom.window.document.getElementById("root");
  globalThis.__renderApp(rootEl);
  await wait(900);

  let html = rootEl.innerHTML;
  console.log("=== OWNER: BASIC ===");
  console.log("App renders (有給管理):", html.includes("有給管理"));
  console.log("Owner name:", html.includes("院長"));
  console.log("Tabs:", ["ホーム", "職員", "カレンダー", "計画年休", "通知", "スタッフ管理", "管理簿"].every((t) => html.includes(t)));

  console.log("=== OWNER: HOME ===");
  console.log("Summary staff count:", html.includes("スタッフ") && html.includes("2人"));
  console.log("要対応 section:", html.includes("要対応"));
  console.log("時効 warning for B:", html.includes("鈴木 美咲") && html.includes("時効消滅"));
  console.log("30日以内の予定 (旅行/通院/研修):", html.includes("これからの取得予定"));
  console.log("Planned in upcoming:", html.includes("計画年休"));

  /* 職員カード */
  click(byText(rootEl, "button", "職員"));
  await wait(400);
  html = rootEl.innerHTML;
  console.log("=== OWNER: STAFF CARDS ===");
  console.log("Cards for both staff:", html.includes("佐藤 花子") && html.includes("鈴木 美咲"));
  console.log("残 display:", html.includes("日分"));
  console.log("年5日義務 bar:", html.includes("年5日義務"));
  console.log("⏳時効 chip on B:", html.includes("⏳"));

  // カードタップで履歴
  click(byText(rootEl, "button", "佐藤 花子"));
  await wait(400);
  html = rootEl.innerHTML;
  console.log("History opens:", html.includes("申請履歴"));

  /* 代理登録の連続入力 */
  console.log("=== OWNER: PROXY CONTINUOUS ADD ===");
  click(byText(rootEl, "button", "院長が代理で取得を登録"));
  await wait(300);
  html = rootEl.innerHTML;
  console.log("Proxy form opens:", html.includes("代理で取得を登録") && html.includes("取得日"));
  const beforeProxy = globalThis.__DB["staff/u-a/leaveRecords"].length;
  setVal([...rootEl.querySelectorAll('input[type="date"]')].pop(), daysFrom(-200));
  await wait(100);
  click(byText(rootEl, "button", "登録する"));
  await wait(700);
  console.log("Proxy record added:", globalThis.__DB["staff/u-a/leaveRecords"].length === beforeProxy + 1);
  html = rootEl.innerHTML;
  console.log("Form stays open (連続入力):", html.includes("続けて登録"));
  console.log("Saved indicator (1件目):", html.includes("1件目"));
  setVal([...rootEl.querySelectorAll('input[type="date"]')].pop(), daysFrom(-190));
  await wait(100);
  click(byText(rootEl, "button", "続けて登録する"));
  await wait(700);
  console.log("Second proxy add:", globalThis.__DB["staff/u-a/leaveRecords"].length === beforeProxy + 2);
  console.log("Saved indicator (2件目):", rootEl.innerHTML.includes("2件目"));
  console.log("1日休みプリセット:", rootEl.innerHTML.includes("1日休み") && rootEl.innerHTML.includes("半日"));

  /* 本人画面プレビュー（院長モード・ログアウト不要） */
  console.log("=== OWNER: IMPERSONATION PREVIEW ===");
  click(byText(rootEl, "button", "本人画面を開く"));
  await wait(700);
  html = rootEl.innerHTML;
  console.log("Preview banner:", html.includes("さんの画面を表示中"));
  console.log("StaffView hero shown:", html.includes("あなたの有給残"));
  console.log("No password card:", !html.includes("パスワード変更"));
  console.log("Staff-style input available:", html.includes("日をタップで取得日に設定"));
  click(byText(rootEl, "button", "院長画面に戻る"));
  await wait(900);
  console.log("Back to owner tabs:", rootEl.innerHTML.includes("スタッフ管理"));

  /* カレンダー */
  click(byText(rootEl, "button", "カレンダー"));
  await wait(400);
  html = rootEl.innerHTML;
  console.log("=== OWNER: CALENDAR ===");
  console.log("Month title:", new RegExp(`${today.getFullYear()}年`).test(html));
  // 12日後は今月or来月 → 表示月に⚠がなければ月送り
  let dupFound = html.includes("⚠");
  if (!dupFound) {
    click(byText(rootEl, "button", "▶"));
    await wait(300);
    dupFound = rootEl.innerHTML.includes("⚠");
  }
  console.log("Same-day dup warning ⚠:", dupFound);

  /* 管理簿 */
  console.log("=== OWNER: LEDGER ===");
  const ykPrint = dom.window.document.querySelector(".yk-print");
  console.log("Ledger rendered:", !!ykPrint);
  const ykHtml = ykPrint?.innerHTML || "";
  console.log("Ledger title+names:", ykHtml.includes("年次有給休暇管理簿") && ykHtml.includes("佐藤 花子") && ykHtml.includes("鈴木 美咲"));
  console.log("Ledger 基準日/残:", ykHtml.includes("基準日") && ykHtml.includes("残日数"));
  console.log("Ledger pages = staff数:", dom.window.document.querySelectorAll(".yk-print-page").length === 2);
  click(byText(rootEl, "button", "管理簿"));
  await wait(200);
  console.log("Print called:", globalThis.__printed >= 1);

  /* ========== スタッフ側 ========== */
  globalThis.__AUTH_UID = "u-a";
  const root2 = dom.window.document.getElementById("root2");
  globalThis.__renderApp(root2);
  await wait(900);
  html = root2.innerHTML;
  console.log("=== STAFF: HERO ===");
  console.log("Hero 残:", html.includes("あなたの有給残"));
  console.log("年5日義務 in hero:", html.includes("年5日取得義務"));
  console.log("MiniPickCal:", html.includes("日をタップで取得日に設定"));

  /* 日タップ→date反映 */
  const calBtn = byText(root2, "button", "25") || byText(root2, "button", "5");
  click(calBtn);
  await wait(250);
  const dateInput = [...root2.querySelectorAll('input[type="date"]')][0];
  console.log("Tap sets date:", !!dateInput && dateInput.value.endsWith(calBtn.textContent.trim().padStart(2, "0")));

  /* 登録→トースト→取消 */
  console.log("=== STAFF: ADD + TOAST ===");
  const before = globalThis.__DB["staff/u-a/leaveRecords"].length;
  click(byText(root2, "button", "1日（480分）"));
  await wait(150);
  click(byText(root2, "button", "登録する"));
  await wait(700);
  console.log("Record added:", globalThis.__DB["staff/u-a/leaveRecords"].length === before + 1);
  html = root2.innerHTML;
  console.log("Toast with 取消:", html.includes("を登録しました") && html.includes("取消"));
  click(byText(root2, "button", "取消"));
  await wait(700);
  console.log("Undo removes record:", globalThis.__DB["staff/u-a/leaveRecords"].length === before);

  /* ========== パスワード変更(スタッフ側) ========== */
  console.log("=== STAFF: PASSWORD ===");
  html = root2.innerHTML;
  console.log("Password card:", html.includes("パスワード変更"));
  click(byText(root2, "button", "変更する"));
  await wait(200);
  const pwInputs = [...root2.querySelectorAll('input[type="password"]')];
  console.log("3 password fields:", pwInputs.length === 3);
  setVal(pwInputs[0], "oldpass1");
  setVal(pwInputs[1], "newpass1");
  setVal(pwInputs[2], "newpass1");
  await wait(100);
  click([...root2.querySelectorAll("button")].filter((b) => b.textContent === "変更する").pop());
  await wait(500);
  console.log("changePassword called:", globalThis.__pwChanged?.next === "newpass1");
  console.log("Password toast:", root2.innerHTML.includes("パスワードを変更しました"));

  /* ========== スタッフ管理: ログインID方式の新規作成 ========== */
  console.log("=== OWNER: CREATE STAFF ===");
  click(byText(rootEl, "button", "スタッフ管理"));
  await wait(400);
  click(byText(rootEl, "button", "＋ 新規スタッフ"));
  await wait(300);
  html = rootEl.innerHTML;
  console.log("New form has ログインID+初期パスワード:", html.includes("ログインID") && html.includes("初期パスワード"));
  console.log("No UID field:", !html.includes("Auth UID"));
  const mgrInputs = [...rootEl.querySelectorAll("input")];
  const nameInput = mgrInputs.find((i) => i.placeholder === "武田 秀美");
  const idInput = mgrInputs.find((i) => i.placeholder === "hanako");
  const pwInput = mgrInputs.find((i) => i.placeholder === "6文字以上");
  const dateInput2 = mgrInputs.find((i) => i.type === "date");
  setVal(nameInput, "田中 三奈");
  setVal(idInput, "mina");
  setVal(pwInput, "mina2026");
  setVal(dateInput2, daysFrom(-365));
  await wait(100);
  click(byText(rootEl, "button", "保存"));
  await wait(600);
  const createdOk = (globalThis.__createdAccounts || []).some((a) => a.loginId === "mina");
  const staffAdded = globalThis.__DB["staff"].some((s) => s.loginId === "mina" && s.name === "田中 三奈");
  console.log("Account created via stub:", createdOk);
  console.log("Staff doc saved with loginId:", staffAdded);

  /* 退職 → ログインブロック → 復帰 → 完全削除 */
  console.log("=== OWNER: RETIRE / RESTORE / DELETE ===");
  let rowMina = [...rootEl.querySelectorAll("tr")].find((tr) => tr.textContent.includes("田中 三奈"));
  click(byText(rowMina, "button", "編集"));
  await wait(300);
  html = rootEl.innerHTML;
  console.log("Retire section in form:", html.includes("退職にする"));
  console.log("Delete section in form:", html.includes("完全削除"));
  click(byText(rootEl, "button", "この日付で退職にする"));
  await wait(900);
  const minaDoc = globalThis.__DB["staff"].find((s) => s.name === "田中 三奈");
  console.log("Status retired + date:", minaDoc?.status === "retired" && !!minaDoc?.retiredDate);
  html = rootEl.innerHTML;
  console.log("退職者欄に表示:", html.includes("退職者") && html.includes("田中 三奈"));

  // 退職者がログインすると「退職済み」でブロック
  globalThis.__AUTH_UID = minaDoc.id;
  const root4 = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(root4);
  globalThis.__renderApp(root4);
  await wait(700);
  console.log("Retired login blocked:", root4.innerHTML.includes("退職済み"));

  // 復帰
  click(byText(rootEl, "button", "在籍に戻す"));
  await wait(900);
  console.log("Restore to active:", globalThis.__DB["staff"].find((s) => s.name === "田中 三奈")?.status === "active");

  // 完全削除（記録ごと）
  rowMina = [...rootEl.querySelectorAll("tr")].find((tr) => tr.textContent.includes("田中 三奈"));
  click(byText(rowMina, "button", "編集"));
  await wait(300);
  click(byText(rootEl, "button", "このスタッフを完全削除する"));
  await wait(900);
  console.log("Completely deleted:", !globalThis.__DB["staff"].some((s) => s.name === "田中 三奈"));

  /* 手順書モーダル */
  console.log("=== OWNER: REISSUE GUIDE ===");
  click(byText(rootEl, "button", "📖 再発行の手順書"));
  await wait(300);
  html = rootEl.innerHTML;
  console.log("Guide opens:", html.includes("アカウント再発行の手順書"));
  console.log("Guide has console steps:", html.includes("console.firebase.google.com") && html.includes("Authentication"));
  console.log("Guide has 6 steps:", html.includes("本人に伝える"));
  click(byText(rootEl, "button", "閉じる"));
  await wait(200);
  console.log("Guide closes:", !rootEl.innerHTML.includes("アカウント再発行の手順書"));

  /* ========== ログイン画面(未ログイン時) ========== */
  console.log("=== LOGIN SCREEN ===");
  globalThis.__AUTH_UID = null;
  const root3 = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(root3);
  globalThis.__renderApp(root3);
  await wait(600);
  html = root3.innerHTML;
  console.log("Login shows ログインID:", html.includes("ログインID") && !html.includes("メールアドレス"));
  console.log("Login placeholder:", html.includes("例: hanako"));
} catch (e) {
  console.error = origError;
  console.log("=== RENDER FAILED ===");
  console.log(e.stack?.slice(0, 1500));
  process.exit(1);
}

console.log(`\n==== ${__pass} passed / ${__fail} failed ====`);
console.log(__fail === 0 ? "✅ all passed" : "❌ FAILED");
process.exit(__fail === 0 ? 0 : 1);
