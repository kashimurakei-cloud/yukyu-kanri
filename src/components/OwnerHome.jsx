import React, { useMemo, useState } from "react";
import { calcBalance, nextGrant, calcUpcomingPlanned, fiveDayProgress, expiringGrants, fmt, todayStr, empTypeOf } from "../lib/leave";
import { S, accent } from "../styles";

const WD = ["日", "月", "火", "水", "木", "金", "土"];
const fmtMD = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const wdOf = (d) => WD[new Date(d + "T00:00:00").getDay()];

/* 全職員の分析をまとめて計算 */
export function analyzeAll(staffList, recordsByStaff, pendingPlanned) {
  return staffList.map((s) => {
    const records = recordsByStaff[s.id] || [];
    const bal = calcBalance(s, records);
    const ng = s.noLeave ? null : nextGrant(s.joinDate, s.workDaysPerWeek);
    const up = calcUpcomingPlanned(s, pendingPlanned);
    const forecast = bal.remainMin - up.minutes;
    const five = fiveDayProgress(s, records);
    const expiring = expiringGrants(s, records);
    return { s, records, bal, ng, up, forecast, five, expiring };
  });
}

/* ============ 🏠 ホーム(ダッシュボード) ============ */
export default function OwnerHome({ staffList, recordsByStaff, pendingPlanned, onOpenStaff, onGoTab }) {
  const today = todayStr();
  const rows = useMemo(
    () => analyzeAll(staffList, recordsByStaff, pendingPlanned),
    [staffList, recordsByStaff, pendingPlanned]
  );

  // 要対応リスト
  const alerts = [];
  for (const r of rows) {
    if (r.s.noLeave) continue; // 有給の付与対象外は警告なし
    if (r.five && r.five.status === "danger")
      alerts.push({ level: "high", uid: r.s.id, msg: `${r.s.name}さん：年5日義務まで あと${r.five.need.toFixed(1)}日（期限 ${fmt(r.five.deadline)}・残り${r.five.daysLeft}日）` });
    else if (r.five && r.five.status === "warn")
      alerts.push({ level: "mid", uid: r.s.id, msg: `${r.s.name}さん：年5日義務のペースが遅れています（現在 ${r.five.takenDays.toFixed(1)}日）` });
    for (const e of r.expiring)
      alerts.push({ level: "mid", uid: r.s.id, msg: `${r.s.name}さん：${e.remainMin}分（約${e.remainDays.toFixed(1)}日分）が ${fmt(e.expireDate)} に時効消滅（あと${e.inDays}日）` });
    // 非常勤は残不足なら計画年休が自動スキップされるので、不足見込みの警告は出さない
    if (r.forecast < 0 && empTypeOf(r.s) !== "part")
      alerts.push({ level: "high", uid: r.s.id, msg: `${r.s.name}さん：計画年休で残が不足する見込み（${r.forecast}分）` });
    if (r.bal.recentOverflowMin > 0)
      alerts.push({ level: "high", uid: r.s.id, msg: `${r.s.name}さん：超過取得 ${r.bal.recentOverflowMin}分（有給残とは別枠）。給与側の対応か記録の修正を` });
  }
  alerts.sort((a, b) => (a.level === "high" ? -1 : 1) - (b.level === "high" ? -1 : 1));

  // 直近30日の取得予定(全員分+計画年休)
  const upcoming = [];
  const horizon = new Date(today + "T00:00:00"); horizon.setDate(horizon.getDate() + 30);
  // toISOString()はUTC変換でJSTだと1日ずれるため使わない
  const horizonStr = `${horizon.getFullYear()}-${String(horizon.getMonth() + 1).padStart(2, "0")}-${String(horizon.getDate()).padStart(2, "0")}`;
  for (const r of rows) {
    for (const rec of r.records) {
      // 残高合わせの調整記録は「取得予定」ではないので出さない
      if (rec.type !== "adjust" && rec.date >= today && rec.date <= horizonStr) {
        upcoming.push({ date: rec.date, name: r.s.name, minutes: rec.minutes, daily: r.bal.daily, type: rec.type });
      }
    }
  }
  for (const p of pendingPlanned) {
    if (p.date >= today && p.date <= horizonStr) {
      upcoming.push({ date: p.date, name: "全員", minutes: 0, daily: 480, type: "planned", memo: p.memo });
    }
  }
  upcoming.sort((a, b) => (a.date < b.date ? -1 : 1));

  const fiveDone = rows.filter((r) => r.five && r.five.status === "done").length;
  const fiveTarget = rows.filter((r) => r.five).length;

  return (
    <>
      {/* サマリー */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
        <SummaryCard label="スタッフ" value={`${staffList.length}人`} />
        <SummaryCard label="30日以内の取得予定" value={`${upcoming.length}件`} />
        <SummaryCard label="年5日義務 達成" value={fiveTarget ? `${fiveDone}/${fiveTarget}人` : "—"} />
        <SummaryCard
          label="要対応"
          value={`${alerts.length}件`}
          tone={alerts.some((a) => a.level === "high") ? "danger" : alerts.length ? "warn" : "ok"}
        />
      </div>

      {/* 要対応 */}
      <section style={S.card}>
        <h2 style={S.cardTitle}>⚠ 要対応</h2>
        {alerts.length === 0 ? (
          <p style={S.empty}>いま対応が必要なことはありません。</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {alerts.map((a, i) => (
              <button
                key={i}
                onClick={() => onOpenStaff(a.uid)}
                style={{
                  textAlign: "left", padding: "10px 14px", borderRadius: 10, cursor: "pointer",
                  fontSize: 13.5, fontWeight: 600, lineHeight: 1.5,
                  border: `1.5px solid ${a.level === "high" ? "#e3b5ad" : "#ead9ad"}`,
                  background: a.level === "high" ? "#fdecea" : "#fbf4e3",
                  color: a.level === "high" ? "#8e2a18" : "#7d5a14",
                }}
              >
                {a.msg}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 直近の取得予定 */}
      <section style={S.card}>
        <h2 style={S.cardTitle}>📅 これからの取得予定（30日以内）</h2>
        {upcoming.length === 0 ? (
          <p style={S.empty}>直近30日の取得予定はありません。</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {upcoming.map((u, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "baseline", gap: 10,
                padding: "8px 4px", borderBottom: "1px solid #eee9df", fontSize: 14,
              }}>
                <span style={{ fontWeight: 800, minWidth: 86 }}>
                  {fmtMD(u.date)}（{wdOf(u.date)}）
                </span>
                <span style={{ fontWeight: 700 }}>{u.name}</span>
                <span style={u.type === "planned" ? S.tagPlan : S.tagNormal}>
                  {u.type === "planned" ? "計画年休" : "有給"}
                </span>
                <span style={{ color: "#6a665e", fontSize: 12.5 }}>
                  {u.minutes > 0 ? `${u.minutes}分（約${(u.minutes / u.daily).toFixed(1)}日分）` : u.memo || ""}
                </span>
              </div>
            ))}
          </div>
        )}
        <p style={S.noteSmall}>同じ日に複数人が休む日はカレンダーで⚠表示されます。</p>
      </section>
    </>
  );
}

function SummaryCard({ label, value, tone }) {
  const color = tone === "danger" ? "#b4341f" : tone === "warn" ? "#b07a1f" : "#1f2421";
  return (
    <div style={{ background: "#fff", border: "1px solid #e2ded5", borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ fontSize: 12, color: "#8a857a", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 2, color }}>{value}</div>
    </div>
  );
}

/* ============ 📅 カレンダービュー ============ */
export function LeaveCalendar({ staffList, recordsByStaff, pendingPlanned }) {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });

  const move = (d) => {
    setYm(({ y, m }) => {
      let nm = m + d, ny = y;
      if (nm < 1) { nm = 12; ny--; }
      if (nm > 12) { nm = 1; ny++; }
      return { y: ny, m: nm };
    });
  };

  // 日付→休む人
  const byDate = {};
  for (const s of staffList) {
    for (const r of recordsByStaff[s.id] || []) {
      (byDate[r.date] = byDate[r.date] || []).push({ name: s.name, type: r.type });
    }
  }
  for (const p of pendingPlanned) {
    (byDate[p.date] = byDate[p.date] || []).push({ name: "全員", type: "planned" });
  }

  const dim = new Date(ym.y, ym.m, 0).getDate();
  const first = new Date(ym.y, ym.m - 1, 1).getDay();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const today = todayStr();

  return (
    <section style={S.card}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <button style={S.btnGhost} onClick={() => move(-1)}>◀</button>
        <h2 style={{ ...S.cardTitle, margin: 0, flex: 1, textAlign: "center" }}>{ym.y}年 {ym.m}月</h2>
        <button style={S.btnGhost} onClick={() => move(1)}>▶</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
        {WD.map((w, i) => (
          <div key={"h" + i} style={{
            textAlign: "center", fontSize: 12, fontWeight: 800, padding: "4px 0",
            color: i === 0 ? "#b4341f" : i === 6 ? "#2a6fb0" : "#6a665e",
          }}>{w}</div>
        ))}
        {cells.map((d, i) => {
          if (d == null) return <div key={i} />;
          const ds = `${ym.y}-${String(ym.m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const people = byDate[ds] || [];
          const staffOff = people.filter((p) => p.name !== "全員");
          const dup = staffOff.length >= 2;
          return (
            <div key={i} style={{
              minHeight: 66, borderRadius: 8, padding: "4px 5px",
              border: dup ? "2px solid #b4341f" : "1px solid #e2ded5",
              background: ds === today ? "#e3efea" : people.length ? "#fdfcf9" : "#fff",
              fontSize: 11,
            }}>
              <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 2 }}>
                {d}{dup && <span style={{ color: "#b4341f", marginLeft: 3 }}>⚠</span>}
              </div>
              {people.map((p, j) => (
                <div key={j} style={{
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  color: p.type === "planned" ? accent : "#1f2421", fontWeight: 600,
                }}>
                  {p.type === "planned" ? "🏖" : "・"}{p.name}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <p style={S.noteSmall}>
        ⚠赤枠＝スタッフ2人以上が同じ日に休む予定。🏖＝計画年休（全員）。
      </p>
    </section>
  );
}
