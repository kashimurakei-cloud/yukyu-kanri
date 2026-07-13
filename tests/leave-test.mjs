/* ============================================================
   lib/leave.js 計算ロジックのユニットテスト
   JSTでの日付ずれバグを検出するため TZ=Asia/Tokyo 固定で実行。
   実行: npm test（ui-test.mjs の前に走る）
============================================================ */
process.env.TZ = "Asia/Tokyo";

const { addMonths, todayStr, calcBalance, expiringGrants } = await import("../src/lib/leave.js");

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
}
// 時効消滅が無いケースは従来計算と一致（残 = 付与 − 取得）
{
  const staff = { joinDate: "2025-01-01", workDaysPerWeek: 5, dailyMinutes: 480 };
  const records = [{ date: "2025-08-01", minutes: 480 }];
  const bal = calcBalance(staff, records, "2026-06-01"); // 2回目付与(2026-07-01)前
  check("時効なし: 残 = 10日 − 1日", bal.remainMin === 9 * 480);
}
// 付与前の日付の取得（入力ミス等）は overflow として残から差し引く（過大計上しない）
{
  const staff = { joinDate: "2025-01-01", workDaysPerWeek: 5, dailyMinutes: 480 };
  const records = [{ date: "2025-06-01", minutes: 480 }]; // 初回付与(2025-07-01)より前
  const bal = calcBalance(staff, records, "2026-06-01");
  check("付与前取得は残から控除", bal.remainMin === 9 * 480);
}
// 半日取得の端数もFIFOで正しく引ける
{
  const staff = { joinDate: "2025-01-01", workDaysPerWeek: 5, dailyMinutes: 480 };
  const records = [{ date: "2025-08-01", minutes: 240 }, { date: "2025-09-01", minutes: 240 }];
  const bal = calcBalance(staff, records, "2026-06-01");
  check("半日×2 = 1日消化", bal.remainMin === 9 * 480);
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
