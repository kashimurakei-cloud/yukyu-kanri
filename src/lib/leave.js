// 有給の付与・残数計算ロジック（プロトタイプで検証済みのものを移植）

export const GRANT_TABLE = {
  5: [10, 11, 12, 14, 16, 18, 20],
  4: [7, 8, 9, 10, 12, 13, 15],
  3: [5, 6, 6, 8, 9, 10, 11],
  2: [3, 4, 4, 5, 6, 6, 7],
  1: [1, 2, 2, 2, 3, 3, 3],
};

export const WEEKDAYS = [
  { key: "sun", label: "日" },
  { key: "mon", label: "月" },
  { key: "tue", label: "火" },
  { key: "wed", label: "水" },
  { key: "thu", label: "木" },
  { key: "fri", label: "金" },
  { key: "sat", label: "土" },
];

export function addMonths(dateStr, months) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() !== day) d.setDate(0);
  return d.toISOString().slice(0, 10);
}
function grantDateAt(joinDate, index) {
  return addMonths(joinDate, 6 + index * 12);
}
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
export function fmt(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${y}/${Number(m)}/${Number(d)}`;
}
export function weekdayKeyOf(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return WEEKDAYS[d.getDay()].key;
}

export function calcGrants(joinDate, workDaysPerWeek, asOf = todayStr()) {
  if (!joinDate) return [];
  const wd = workDaysPerWeek >= 5 ? 5 : workDaysPerWeek;
  const table = GRANT_TABLE[wd];
  if (!table) return [];
  const grants = [];
  for (let i = 0; i < 25; i++) {
    const gd = grantDateAt(joinDate, i);
    if (gd > asOf) break;
    const days = table[Math.min(i, table.length - 1)];
    grants.push({
      index: i,
      label: i === 0 ? "6ヶ月" : `${i}年6ヶ月`,
      grantDate: gd,
      days,
    });
  }
  return grants;
}

export function nextGrant(joinDate, workDaysPerWeek, asOf = todayStr()) {
  if (!joinDate) return null;
  const wd = workDaysPerWeek >= 5 ? 5 : workDaysPerWeek;
  const table = GRANT_TABLE[wd];
  if (!table) return null;
  for (let i = 0; i < 25; i++) {
    const gd = grantDateAt(joinDate, i);
    if (gd > asOf) {
      return {
        grantDate: gd,
        days: table[Math.min(i, table.length - 1)],
        label: i === 0 ? "6ヶ月" : `${i}年6ヶ月`,
      };
    }
  }
  return null;
}

// 残数計算（時効2年）。付与分 = 付与日数 × その人の1日分。
export function calcBalance(staff, records, asOf = todayStr()) {
  const daily = staff.dailyMinutes || 480;
  const rawGrants = calcGrants(staff.joinDate, staff.workDaysPerWeek, asOf);
  const grants = rawGrants.map((g) => ({ ...g, minutes: g.days * daily }));
  const active = grants.filter((g) => addMonths(g.grantDate, 24) > asOf);
  const grantedMin = active.reduce((s, g) => s + g.minutes, 0);
  const usedMin = (records || []).reduce((s, r) => s + Number(r.minutes || 0), 0);
  return { grants, active, grantedMin, usedMin, remainMin: grantedMin - usedMin, daily };
}

// このスタッフが、指定された計画年休「予定」のうち
// 次回付与日までに引かれる見込み分（分）を計算する。
// plannedLeaves: [{date, ...}] の配列（pendingな予定。台帳）
// 「その日が勤務日（minutesPerDayが>0）」かつ「今日以降〜次回付与日まで」のものを集計。
export function calcUpcomingPlanned(staff, plannedLeaves, asOf = todayStr()) {
  const daily = staff.dailyMinutes || 480;
  const ng = nextGrant(staff.joinDate, staff.workDaysPerWeek, asOf);
  const horizon = ng ? ng.grantDate : "9999-12-31"; // 次回付与日（なければ無限遠）
  let minutes = 0;
  const items = [];
  for (const p of plannedLeaves || []) {
    // 未来（今日より後）かつ 次回付与日より前（含む手前）
    if (p.date >= asOf && p.date < horizon) {
      const key = weekdayKeyOf(p.date);
      const m = staff.minutesPerDay?.[key] ?? 0;
      if (m > 0) {
        minutes += m;
        items.push({ date: p.date, minutes: m, memo: p.memo || "" });
      }
    }
  }
  return { minutes, days: minutes / daily, items, horizon };
}

/* ---------- ② 年5日取得義務の進捗 ----------
   直近の基準日(付与日)から1年間で5日取得が義務(10日以上付与の職員)。
   計画年休も取得日数に数える。 */
export function fiveDayProgress(staff, records, asOf = todayStr()) {
  const grants = calcGrants(staff.joinDate, staff.workDaysPerWeek, asOf);
  if (grants.length === 0) return null;
  const g = grants[grants.length - 1]; // 直近の基準日
  if (g.days < 10) return null; // 義務の対象外
  const daily = staff.dailyMinutes || 480;
  const start = g.grantDate;
  const deadline = addMonths(start, 12);
  const takenMin = (records || [])
    .filter((r) => r.date >= start && r.date < deadline)
    .reduce((s, r) => s + Number(r.minutes || 0), 0);
  const takenDays = takenMin / daily;
  const need = Math.max(0, 5 - takenDays);
  const daysLeft = Math.max(0, Math.round((new Date(deadline + "T00:00:00") - new Date(asOf + "T00:00:00")) / 86400000));
  let status = "done"; // 達成
  if (need > 0) {
    const elapsedRatio = Math.min(1, Math.max(0, 1 - daysLeft / 365));
    if (daysLeft <= 90) status = "danger";       // 期限3ヶ月切りで未達
    else if (takenDays + 0.5 < 5 * elapsedRatio) status = "warn"; // ペース遅れ
    else status = "ontrack";
  }
  return { start, deadline, takenDays, need, daysLeft, status };
}

/* ---------- ③ 時効消滅の事前警告 ----------
   古い付与から順に消化した(FIFO)と仮定し、残った分の失効予定を出す。 */
export function expiringGrants(staff, records, asOf = todayStr(), withinDays = 90) {
  const daily = staff.dailyMinutes || 480;
  const grants = calcGrants(staff.joinDate, staff.workDaysPerWeek, asOf)
    .map((g) => ({ ...g, minutes: g.days * daily, expire: addMonths(g.grantDate, 24) }));
  let pool = (records || []).reduce((s, r) => s + Number(r.minutes || 0), 0);
  const out = [];
  for (const g of grants) {
    const consumed = Math.min(pool, g.minutes);
    pool -= consumed;
    const left = g.minutes - consumed;
    if (left > 0 && g.expire > asOf) {
      const inDays = Math.round((new Date(g.expire + "T00:00:00") - new Date(asOf + "T00:00:00")) / 86400000);
      if (inDays <= withinDays) {
        out.push({ expireDate: g.expire, remainMin: left, remainDays: left / daily, inDays });
      }
    }
  }
  return out;
}
