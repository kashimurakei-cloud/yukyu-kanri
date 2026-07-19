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

// ローカルタイムで YYYY-MM-DD にする（toISOString はUTC変換で1日ずれるため使わない）
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function addMonths(dateStr, months) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() !== day) d.setDate(0);
  return toDateStr(d);
}
function grantDateAt(joinDate, index) {
  return addMonths(joinDate, 6 + index * 12);
}
export function todayStr() {
  return toDateStr(new Date());
}
export function fmt(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${y}/${Number(m)}/${Number(d)}`;
}
// 曜日つき: 2025/12/3（水）
export function fmtW(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return `${fmt(dateStr)}（${WEEKDAYS[d.getDay()].label}）`;
}
export function weekdayKeyOf(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return WEEKDAYS[d.getDay()].key;
}

// noGrantDates: 出勤率8割未満などで「付与なし」にした付与日(YYYY-MM-DD)の配列。
// その年は0日付与になるが、勤続年数のカウント（テーブルの段階）は進む（労基法の扱い通り）。
export function calcGrants(joinDate, workDaysPerWeek, asOf = todayStr(), noGrantDates = []) {
  if (!joinDate) return [];
  const wd = workDaysPerWeek >= 5 ? 5 : workDaysPerWeek;
  const table = GRANT_TABLE[wd];
  if (!table) return [];
  const grants = [];
  for (let i = 0; i < 25; i++) {
    const gd = grantDateAt(joinDate, i);
    if (gd > asOf) break;
    const days = table[Math.min(i, table.length - 1)];
    const skipped = (noGrantDates || []).includes(gd);
    grants.push({
      index: i,
      label: i === 0 ? "6ヶ月" : `${i}年6ヶ月`,
      grantDate: gd,
      days: skipped ? 0 : days,
      skipped,
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

/* FIFO消化: 各取得を「その取得日時点で有効だった付与」から古い順に引く。
   どの付与にも当てられない分は overflow として返す（残から差し引いて過大計上を防ぐ）。 */
function fifoConsume(grants, records) {
  const left = grants.map((g) => g.minutes);
  const alloc = grants.map(() => []); // 各付与から「いつ・何分」消化されたか
  let overflow = 0;
  const overflowItems = []; // いつ・何分の超過だったか
  const recs = [...(records || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const r of recs) {
    let need = Number(r.minutes || 0);
    for (let i = 0; i < grants.length && need > 0; i++) {
      const g = grants[i];
      if (g.grantDate <= r.date && r.date < g.expire && left[i] > 0) {
        const take = Math.min(left[i], need);
        left[i] -= take;
        need -= take;
        if (take > 0) alloc[i].push({ date: r.date, minutes: take });
      }
    }
    if (need > 0) overflowItems.push({ date: r.date, minutes: need });
    overflow += need;
  }
  return { left, overflow, alloc, overflowItems };
}

// 残数計算（時効2年・FIFO消化）。付与分 = 付与日数 × その人の1日分。
// 過去分をさかのぼって登録しても「当時の付与」から消化されるため、
// 時効消滅済みの付与にかかる取得は現在の残を減らさない。
export function calcBalance(staff, records, asOf = todayStr()) {
  const daily = staff.dailyMinutes || 480;
  // 有給の付与対象外（専従者・年間所定48日未満など）は付与ゼロ
  const rawGrants = staff.noLeave ? [] : calcGrants(staff.joinDate, staff.workDaysPerWeek, asOf, staff.noGrantDates || []);
  const grants = rawGrants.map((g) => ({ ...g, minutes: g.days * daily, expire: addMonths(g.grantDate, 24) }));
  const active = grants.filter((g) => g.expire > asOf);
  const grantedMin = active.reduce((s, g) => s + g.minutes, 0);
  const usedMin = (records || []).reduce((s, r) => s + Number(r.minutes || 0), 0);
  const { left, overflow, alloc, overflowItems } = fifoConsume(grants, records);
  let remainMin = 0;
  let lapsedMin = 0; // 時効消滅した未消化分
  grants.forEach((g, i) => {
    // 付与ごとの消化状況（付与の履歴の表示に使う）
    g.leftMin = left[i];
    g.consumedMin = g.minutes - left[i];
    g.alloc = alloc[i];
    if (g.expire > asOf) remainMin += left[i];
    else lapsedMin += left[i];
  });
  // overflowMin: どの付与からも引けなかった取得分（残高オーバー）の累計。
  // 有給残とは相殺しない（翌年付与から引いたりしない）。別枠で表示し、給与側で対応する運用。
  // recentOverflowMin: 直近の付与日以降に発生した超過。スタッフ画面と要対応はこちらを使い、
  // 新しい付与が来たら古い超過は表示から消える（院長の履歴カードには累計を残す）。
  const lastGrantDate = grants.length > 0 ? grants[grants.length - 1].grantDate : null;
  const recentOverflowItems = (overflowItems || []).filter((o) => !lastGrantDate || o.date >= lastGrantDate);
  const recentOverflowMin = recentOverflowItems.reduce((s, o) => s + o.minutes, 0);
  return {
    grants, active, grantedMin, usedMin, remainMin, lapsedMin,
    overflowMin: overflow, recentOverflowMin,
    overflowItems, // いつ・何分オーバーしたか（全期間）
    recentOverflowItems, // 直近付与日以降のもの
    daily,
  };
}

// 常勤/非常勤（employmentType未設定の古いデータは週5以上を常勤とみなす）
export function empTypeOf(s) {
  return s.employmentType || (Number(s.workDaysPerWeek) >= 5 ? "full" : "part");
}
export const EMP_LABEL = { full: "常勤", part: "非常勤" };

// その日時点で使える残（その日以前の記録だけで計算）。
// 計画年休の反映時に「残が足りないパートには充てない」判定に使う。
export function availableAt(staff, records, date) {
  const recs = (records || []).filter((r) => r.date <= date);
  return calcBalance(staff, recs, date).remainMin;
}

// 出勤率(8割)確認: 次回付与の算定期間（前回付与日〜次回付与日の前日。初回は入職日から）の出勤率。
// attendance: [{month:"YYYY-MM", worked, absent}]（任意入力）。期間内の入力が無ければ null。
// 有給・計画年休で休んだ日は法律上「出勤」扱いなので、出勤数に含めて入力する運用。
export function attendanceRateFor(staff, attendance, asOf = todayStr()) {
  if (staff.noLeave) return null;
  const ng = nextGrant(staff.joinDate, staff.workDaysPerWeek, asOf);
  if (!ng) return null;
  const start = ng.label === "6ヶ月" ? staff.joinDate : addMonths(ng.grantDate, -12);
  const startM = start.slice(0, 7);
  const endM = ng.grantDate.slice(0, 7);
  const rows = (attendance || []).filter((a) => a.month >= startM && a.month <= endM);
  if (rows.length === 0) return null;
  const worked = rows.reduce((s, a) => s + Number(a.worked || 0), 0);
  const absent = rows.reduce((s, a) => s + Number(a.absent || 0), 0);
  const total = worked + absent;
  if (total <= 0) return null;
  const rate = worked / total;
  return { grantDate: ng.grantDate, start, worked, absent, total, rate, months: rows.length, ok: rate >= 0.8 };
}

// 取得記録を付与期間ごとにグループ化（履歴の折りたたみ表示用）。
// 期間 = 各付与日〜次の付与日の前日。初回付与より前の記録は「初回付与前」。新しい期間が先頭。
export function groupRecordsByPeriod(staff, records, asOf = todayStr()) {
  const grants = calcGrants(staff.joinDate, staff.workDaysPerWeek, asOf, staff.noGrantDates || []);
  const dates = grants.map((g) => g.grantDate);
  const map = new Map();
  for (const r of records || []) {
    let start = null;
    for (const d of dates) {
      if (d <= r.date) start = d;
      else break;
    }
    const key = start || "pre";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  const currentStart = dates.length ? dates[dates.length - 1] : null;
  const out = [];
  for (const [key, recs] of map) {
    recs.sort((a, b) => (a.date < b.date ? 1 : -1));
    out.push({
      key,
      start: key === "pre" ? null : key,
      isCurrent: key !== "pre" && key === currentStart,
      records: recs,
      totalMin: recs.reduce((s, r) => s + Number(r.minutes || 0), 0),
    });
  }
  out.sort((a, b) => ((a.start || "0000") < (b.start || "0000") ? 1 : -1));
  return out;
}

// 付与期間ごとの出勤率一覧（過去の付与＋次回付与）。過去数年分の勤怠を入れて後から8割確認できる。
// 各付与の算定期間 = 前の付与日〜その付与日（初回は入職日〜）。月単位の近似で集計。
// 入力のない期間は出さない。新しい順で返す。
export function attendancePeriods(staff, attendance, asOf = todayStr()) {
  if (!staff.joinDate || staff.noLeave) return [];
  const past = calcGrants(staff.joinDate, staff.workDaysPerWeek, asOf, staff.noGrantDates || []);
  const ng = nextGrant(staff.joinDate, staff.workDaysPerWeek, asOf);
  const all = [
    ...past.map((g) => ({ grantDate: g.grantDate, label: g.label, skipped: g.skipped, future: false })),
    ...(ng ? [{ grantDate: ng.grantDate, label: ng.label, skipped: false, future: true }] : []),
  ];
  const out = [];
  for (let i = 0; i < all.length; i++) {
    const g = all[i];
    const start = i === 0 ? staff.joinDate : all[i - 1].grantDate;
    const startM = start.slice(0, 7);
    const endM = g.grantDate.slice(0, 7);
    const rows = (attendance || []).filter((a) => a.month >= startM && a.month <= endM);
    if (rows.length === 0) continue;
    const worked = rows.reduce((s, a) => s + Number(a.worked || 0), 0);
    const absent = rows.reduce((s, a) => s + Number(a.absent || 0), 0);
    const total = worked + absent;
    if (total <= 0) continue;
    const rate = worked / total;
    out.push({
      grantDate: g.grantDate, label: g.label, skipped: g.skipped, future: g.future,
      start, worked, absent, total, rate, months: rows.length, ok: rate >= 0.8,
    });
  }
  return out.reverse(); // 新しい順
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
  if (staff.noLeave) return null;
  const grants = calcGrants(staff.joinDate, staff.workDaysPerWeek, asOf, staff.noGrantDates || []);
  if (grants.length === 0) return null;
  const g = grants[grants.length - 1]; // 直近の基準日
  if (g.days < 10) return null; // 義務の対象外
  const daily = staff.dailyMinutes || 480;
  const start = g.grantDate;
  const deadline = addMonths(start, 12);
  const takenMin = (records || [])
    // 残高合わせの調整記録(type:"adjust")は実取得ではないので年5日義務には数えない
    .filter((r) => r.type !== "adjust" && r.date >= start && r.date < deadline)
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
   FIFO消化（各取得は取得日時点で有効だった付与から）後に残った分の失効予定を出す。 */
export function expiringGrants(staff, records, asOf = todayStr(), withinDays = 90) {
  if (staff.noLeave) return [];
  const daily = staff.dailyMinutes || 480;
  const grants = calcGrants(staff.joinDate, staff.workDaysPerWeek, asOf, staff.noGrantDates || [])
    .map((g) => ({ ...g, minutes: g.days * daily, expire: addMonths(g.grantDate, 24) }));
  const { left } = fifoConsume(grants, records);
  const out = [];
  grants.forEach((g, i) => {
    if (left[i] > 0 && g.expire > asOf) {
      const inDays = Math.round((new Date(g.expire + "T00:00:00") - new Date(asOf + "T00:00:00")) / 86400000);
      if (inDays <= withinDays) {
        out.push({ expireDate: g.expire, remainMin: left[i], remainDays: left[i] / daily, inDays });
      }
    }
  });
  return out;
}
