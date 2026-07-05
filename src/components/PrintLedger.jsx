import React from "react";
import { createPortal } from "react-dom";
import { calcBalance, calcGrants, fiveDayProgress, fmt, todayStr } from "../lib/leave";

/* 年次有給休暇管理簿（労基法で作成・3年保存が義務の帳票）
   画面では非表示、印刷時のみ出力される（1人1ページ） */
export default function PrintLedger({ staffList, recordsByStaff }) {
  const today = todayStr();
  const WD = ["日", "月", "火", "水", "木", "金", "土"];
  return createPortal(
    <div className="yk-print">
      {staffList.map((s) => {
        const records = [...(recordsByStaff[s.id] || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
        const bal = calcBalance(s, records);
        const grants = calcGrants(s.joinDate, s.workDaysPerWeek);
        const base = grants.length ? grants[grants.length - 1] : null; // 直近の基準日
        const five = fiveDayProgress(s, records);
        const daily = bal.daily;
        return (
          <div className="yk-print-page" key={s.id}>
            <div className="yk-print-head">
              <span className="yk-print-title">年次有給休暇管理簿</span>
              <span className="yk-print-date">作成日 {fmt(today)}　すこやか歯科医院</span>
            </div>
            <table className="yk-print-meta">
              <tbody>
                <tr>
                  <th>氏名</th><td className="yk-name">{s.name}</td>
                  <th>入職日</th><td>{fmt(s.joinDate)}</td>
                  <th>週所定</th><td>週{s.workDaysPerWeek}日・1日{daily}分</td>
                </tr>
                <tr>
                  <th>基準日</th><td>{base ? fmt(base.grantDate) : "—"}</td>
                  <th>付与日数</th><td>{base ? `${base.days}日` : "—"}</td>
                  <th>年5日義務</th>
                  <td>
                    {five
                      ? `${five.takenDays.toFixed(1)}日取得 ／ 期限 ${fmt(five.deadline)}${five.need > 0 ? `（あと${five.need.toFixed(1)}日）` : "（達成）"}`
                      : "対象外"}
                  </td>
                </tr>
              </tbody>
            </table>

            <table className="yk-print-table">
              <thead>
                <tr>
                  <th className="c-no">#</th>
                  <th>取得日（時季）</th>
                  <th>曜日</th>
                  <th>区分</th>
                  <th className="c-r">取得時間</th>
                  <th className="c-r">日数換算</th>
                  <th>備考</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 && (
                  <tr><td colSpan={7} className="c-empty">取得記録なし</td></tr>
                )}
                {records.map((r, i) => (
                  <tr key={r.id}>
                    <td className="c-no">{i + 1}</td>
                    <td>{fmt(r.date)}</td>
                    <td>{WD[new Date(r.date + "T00:00:00").getDay()]}</td>
                    <td>{r.type === "planned" ? "計画年休" : "通常"}</td>
                    <td className="c-r">{r.minutes}分</td>
                    <td className="c-r">{(r.minutes / daily).toFixed(2)}日</td>
                    <td>{r.memo || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <table className="yk-print-sum">
              <tbody>
                <tr>
                  <th>付与合計（有効分）</th>
                  <td>{(bal.grantedMin / daily).toFixed(1)}日分（{bal.grantedMin}分）</td>
                  <th>取得合計</th>
                  <td>{(bal.usedMin / daily).toFixed(1)}日分（{bal.usedMin}分）</td>
                  <th>残日数</th>
                  <td className="yk-strong">{(bal.remainMin / daily).toFixed(1)}日分（{bal.remainMin}分）</td>
                </tr>
              </tbody>
            </table>
            <p className="yk-print-note">
              ※ 基準日＝直近の付与日。時効（付与から2年）を過ぎた付与分は残日数に含めない。本管理簿は3年間保存。
            </p>
          </div>
        );
      })}
    </div>,
    document.body
  );
}
