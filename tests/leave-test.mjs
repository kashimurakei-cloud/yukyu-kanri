/* ============================================================
   lib/leave.js 計算ロジックのユニットテスト
   JSTでの日付ずれバグを検出するため TZ=Asia/Tokyo 固定で実行。
   実行: npm test（ui-test.mjs の前に走る）
============================================================ */
process.env.TZ = "Asia/Tokyo";

const { addMonths, todayStr, calcBalance, expiringGrants, availableAt, empTypeOf } = await import("../src/lib/leave.js");

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) pass++;
  else { fail++; }
  console.log(`${label}: ${cond}${cond ? "" : "  ← ★FAIL"}`);
}

console.log("=== LEAVE: 日付計算（JSTでずれない） ===");
check("addMonths 6ヶ月後", addMonths("2023-06-06", 6) === "2023-12-06");
check("addMonths 12ヶ月後", addMonths("2023-12-06", 12) === "2024-12-06");
check("addMonths 月末まるめ", addMonths("2024-08-31", 6) === "2025-02-28");
{
  const now = new Date();
  const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  check("todayStr がローカル日付", todayStr() === expected);
}

console.log("=== LEAVE: FIFO消化（時効2年） ===");
// 奥谷さんのケース: 2023-06-06入社・週5・1日480分。
// 付与: 2023-12-06(10日) / 2024-12-06(11日) / 2025-12-06(12日)
// 取得2日はどちらも最初の付与から消化 → 最初の付与は8日残して時効消滅。
{
  const staff = { joinDate: "2023-06-06", workDaysPerWeek: 5, dailyMinutes: 480 };
  const records = [
    { date: "2023-12-12", minutes: 480 },
    { date: "2024-04-23", minutes: 480 },
  ];
  const bal = calcBalance(staff, records, "2026-07-13");
  check("付与日が正しい(12/6)", bal.grants[0].grantDate === "2023-12-06");
  check("有効付与 = 11+12日", bal.grantedMin === 23 * 480);
  check("残 = 23日（時効切れ付与から消化済みの2日は引かない）", bal.remainMin === 23 * 480);
  check("時効消滅 = 8日", bal.lapsedMin === 8 * 480);
  check("取得済表示 = 2日", bal.usedMin === 2 * 480);
  // 付与ごとの消化状況（付与の履歴の表示に使う）
  const g0 = bal.grants[0];
  check("初回付与の消化 = 2日分", g0.consumedMin === 2 * 480 && g0.leftMin === 8 * 480);
  check("消化の期間 = 最初〜最後の取得日", g0.alloc[0].date === "2023-12-12" && g0.alloc[g0.alloc.length - 1].date === "2024-04-23");
  check("2回目以降は未消化", bal.grants[1].consumedMin === 0 && bal.grants[2].consumedMin === 0);
}
// 時効消滅が無いケースは従来計算と一致（残 = 付与 − 取得）
{
  const staff = { joinDate: "2025-01-01", workDaysPerWeek: 5, dailyMinutes: 480 };
  const records = [{ date: "2025-08-01", minutes: 480 }];
  const bal = calcBalance(staff, records, "2026-06-01"); // 2回目付与(2026-07-01)前
  check("時効なし: 残 = 10日 − 1日", bal.remainMin === 9 * 480);
}
// どの付与からも引けない取得（超過）は別枠(overflowMin)。残とは相殺しない。
{
  const staff = { joinDate: "2025-01-01", workDaysPerWeek: 5, dailyMinutes: 480 };
  const records = [{ date: "2025-06-01", minutes: 480 }]; // 初回付与(2025-07-01)より前
  const bal = calcBalance(staff, records, "2026-06-01");
  check("超過は残から引かない（相殺しない）", bal.remainMin === 10 * 480);
  check("超過分は別枠(overflowMin)で見える", bal.overflowMin === 480);
}
// 半日取得の端数もFIFOで正しく引ける
{
  const staff = { joinDate: "2025-01-01", workDaysPerWeek: 5, dailyMinutes: 480 };
  const records = [{ date: "2025-08-01", minutes: 240 }, { date: "2025-09-01", minutes: 240 }];
  const bal = calcBalance(staff, records, "2026-06-01");
  check("半日×2 = 1日消化", bal.remainMin === 9 * 480);
}

// 超過の表示期限: 新しい付与が来たら recentOverflowMin は0になる（累計overflowMinは残る）
{
  const staff = { joinDate: "2025-01-01", workDaysPerWeek: 5, dailyMinutes: 480 };
  // 初回付与 2025-07-01(10日=4800分)。2026-06-30に5280分取得 → 480分超過
  const records = [{ date: "2026-06-30", minutes: 5280 }];
  const before = calcBalance(staff, records, "2026-06-30"); // 2回目付与(2026-07-01)前
  check("付与前: 超過は今期分として表示", before.recentOverflowMin === 480 && before.overflowMin === 480);
  const after = calcBalance(staff, records, "2026-08-01"); // 2回目付与後
  check("新付与後: スタッフ向け超過は消える", after.recentOverflowMin === 0);
  check("累計の超過は院長向けに残る", after.overflowMin === 480);
  check("いつ・何分オーバーしたか残る", after.overflowItems.length === 1 && after.overflowItems[0].date === "2026-06-30" && after.overflowItems[0].minutes === 480);
}

// 残高合わせの調整記録(type:"adjust"): 残高は減るが年5日義務には数えない
{
  const { fiveDayProgress } = await import("../src/lib/leave.js");
  const staff = { joinDate: "2023-06-06", workDaysPerWeek: 5, dailyMinutes: 480 };
  const records = [{ date: "2026-07-01", minutes: 5 * 480, type: "adjust" }];
  const bal = calcBalance(staff, records, "2026-07-13");
  check("調整は残高から消化される", bal.remainMin === (23 - 5) * 480);
  const five = fiveDayProgress(staff, records, "2026-07-13");
  check("調整は年5日義務に数えない", five.takenDays === 0);
}

// 付与なし設定(noGrantDates): その年は0日付与・勤続カウントは進む
{
  const staff = { joinDate: "2023-06-06", workDaysPerWeek: 5, dailyMinutes: 480, noGrantDates: ["2024-12-06"] };
  const bal = calcBalance(staff, [], "2026-07-13");
  check("付与なしの年は0日", bal.grants[1].skipped && bal.grants[1].days === 0);
  check("有効付与 = 12日のみ（勤続段階は進む）", bal.grantedMin === 12 * 480);
  check("残 = 12日", bal.remainMin === 12 * 480);
}

// availableAt: その日以前の記録だけで判定（計画年休の残不足スキップ用）
{
  const staff = { joinDate: "2025-01-01", workDaysPerWeek: 5, dailyMinutes: 480 };
  const records = [{ date: "2025-08-01", minutes: 4800 }];
  check("使い切った後の日付では0", availableAt(staff, records, "2025-09-01") === 0);
  check("使う前の日付なら満額", availableAt(staff, records, "2025-07-15") === 4800);
}
// empTypeOf: 計画年休スキップは非常勤のみ
{
  check("employmentType優先", empTypeOf({ employmentType: "part", workDaysPerWeek: 5 }) === "part");
  check("未設定は週5以上=常勤", empTypeOf({ workDaysPerWeek: 5 }) === "full" && empTypeOf({ workDaysPerWeek: 3 }) === "part");
}

console.log("=== LEAVE: 時効警告もFIFO基準 ===");
{
  // 初回付与が90日以内に時効を迎えるケース
  const staff = { joinDate: "2022-06-06", workDaysPerWeek: 5, dailyMinutes: 480 };
  // 初回付与 2022-12-06(10日) は 2024-12-06 に時効。asOf 2024-10-01（66日前）
  const records = [{ date: "2023-01-10", minutes: 480 * 3 }]; // 3日は初回から消化済み
  const warn = expiringGrants(staff, records, "2024-10-01", 90);
  check("警告が出る", warn.length === 1);
  check("失効見込み = 10 − 3 = 7日", warn.length === 1 && warn[0].remainMin === 7 * 480);
  check("失効日 = 2024-12-06", warn.length === 1 && warn[0].expireDate === "2024-12-06");
}

console.log(`\n==== ${pass} passed / ${fail} failed ====`);
console.log(fail === 0 ? "✅ all passed" : "❌ FAILED");
process.exit(fail === 0 ? 0 : 1);
