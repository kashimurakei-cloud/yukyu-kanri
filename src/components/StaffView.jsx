import React, { useEffect, useMemo, useState } from "react";
import { calcBalance, nextGrant, calcUpcomingPlanned, fmt, todayStr, weekdayKeyOf } from "../lib/leave";
import { getLeaveRecords, addLeaveRecord, getPlannedLeaves, deleteLeaveRecord } from "../data";
import { S } from "../styles";

export default function StaffView({ me }) {
  const [records, setRecords] = useState([]);
  const [planned, setPlanned] = useState([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    try {
      const recs = await getLeaveRecords(me.id);
      setRecords(recs);
      const pl = await getPlannedLeaves();
      // pending（まだ反映前）の予定だけを見込みに使う
      setPlanned(pl.filter((p) => p.status !== "applied"));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id]);

  const bal = useMemo(() => calcBalance(me, records), [me, records]);
  const ng = nextGrant(me.joinDate, me.workDaysPerWeek);
  const upcoming = useMemo(() => calcUpcomingPlanned(me, planned), [me, planned]);
  const daily = bal.daily;
  const forecastMin = bal.remainMin - upcoming.minutes;

  async function handleAdd(rec) {
    await addLeaveRecord(me.id, me.name, rec);
    await reload();
  }

  // 本人が取り消せるのは「未来日（取得日が今日より後）の通常取得」だけ
  function canCancel(r) {
    return r.type !== "planned" && r.date > todayStr();
  }
  async function handleCancel(r) {
    if (!canCancel(r)) return;
    if (!confirm(`${fmt(r.date)} の取得（${r.minutes}分）を取り消しますか？`)) return;
    try {
      await deleteLeaveRecord(me.id, r.id);
      await reload();
    } catch (e) {
      console.error(e);
      alert("取り消しに失敗しました。");
    }
  }

  return (
    <>
      <section style={S.heroCard}>
        <div style={S.heroLabel}>あなたの有給残</div>
        <div style={S.heroValue}>
          {(bal.remainMin / daily).toFixed(1)}
          <span style={S.heroDayUnit}>日分</span>
          <span style={S.heroSub}>（残 {bal.remainMin}分 ／ 1日={daily}分）</span>
        </div>
        {upcoming.minutes > 0 && (
          <div style={S.forecastBox}>
            <div style={S.forecastRow}>
              <span>次回付与までの計画年休（予定）</span>
              <span style={S.forecastMinus}>−{(upcoming.minutes / daily).toFixed(1)}日分</span>
            </div>
            <div style={{ ...S.forecastRow, fontWeight: 700 }}>
              <span>差引の見込み残</span>
              <span style={{ color: forecastMin < 0 ? "#ffd2c8" : "#fff" }}>
                {(forecastMin / daily).toFixed(1)}日分
              </span>
            </div>
          </div>
        )}
        <div style={S.heroMeta}>
          <span>付与合計 {(bal.grantedMin / daily).toFixed(1)}日分</span>
          <span style={S.dot}>•</span>
          <span>取得済 {(bal.usedMin / daily).toFixed(1)}日分</span>
          {ng && (
            <>
              <span style={S.dot}>•</span>
              <span>次回付与 {fmt(ng.grantDate)}（{ng.days}日）</span>
            </>
          )}
        </div>
      </section>

      {upcoming.items.length > 0 && (
        <section style={S.card}>
          <h2 style={S.cardTitle}>これから引かれる計画年休（次回付与まで）</h2>
          <ul style={S.plainList}>
            {upcoming.items.map((it) => (
              <li key={it.date} style={S.plainItem}>
                <strong>{fmt(it.date)}</strong>
                <span style={S.tagPlan}>計画年休</span>
                <span style={S.plainMemo}>
                  {(it.minutes / daily).toFixed(1)}日分（{it.minutes}分）
                  {it.memo ? ` ／ ${it.memo}` : ""}
                </span>
              </li>
            ))}
          </ul>
          <p style={S.noteSmall}>これらは予定です。日付が来ると自動で有給から引かれます。</p>
        </section>
      )}

      <div className="grid2" style={S.grid2}>
        <AddRecordCard staff={me} onAdd={handleAdd} />
        <GrantsCard bal={bal} />
      </div>

      <section style={S.card}>
        <h2 style={S.cardTitle}>取得履歴</h2>
        {loading ? (
          <p style={S.empty}>読み込み中…</p>
        ) : records.length === 0 ? (
          <p style={S.empty}>まだ取得記録はありません。上のフォームから登録できます。</p>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>取得日</th>
                <th style={S.th}>区分</th>
                <th style={S.thR}>取得</th>
                <th style={S.th}>メモ</th>
                <th style={S.th}></th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td style={S.td}>{fmt(r.date)}</td>
                  <td style={S.td}>
                    <span style={r.type === "planned" ? S.tagPlan : S.tagNormal}>
                      {r.type === "planned" ? "計画年休" : "通常"}
                    </span>
                  </td>
                  <td style={S.tdR}>
                    {(r.minutes / daily).toFixed(1)}日分
                    <span style={S.minSub}>（{r.minutes}分）</span>
                  </td>
                  <td style={S.tdMemo}>{r.memo || "—"}</td>
                  <td style={S.td}>
                    {canCancel(r) && (
                      <button style={S.linkBtn} onClick={() => handleCancel(r)}>取消</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={S.noteSmall}>取得日が来る前の通常取得は、自分で取り消せます。過ぎた記録や計画年休は院長が修正します。</p>
      </section>
    </>
  );
}

function AddRecordCard({ staff, onAdd }) {
  const [date, setDate] = useState(todayStr());
  const [minutes, setMinutes] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);

  const daily = staff.dailyMinutes || 480;
  const suggested = (staff.minutesPerDay?.[weekdayKeyOf(date)] ?? 0) || daily;

  const AM_MIN = 260;
  const wk = weekdayKeyOf(date);
  const pmMin = wk === "tue" || wk === "fri" ? 270 : 180;
  const pmLabel = wk === "tue" || wk === "fri" ? "午後（270分）" : "午後（180分）";

  function pick(m, note) {
    setMinutes(String(m));
    if (note && !memo) setMemo(note);
  }

  async function submit() {
    const m = Number(minutes || suggested);
    if (!date || !m) return;
    setBusy(true);
    try {
      await onAdd({ date, minutes: m, type: "normal", memo });
      setMinutes("");
      setMemo("");
    } catch (e) {
      console.error(e);
      alert("登録に失敗しました。通信状態を確認してください。");
    }
    setBusy(false);
  }

  return (
    <section style={S.card}>
      <h2 style={S.cardTitle}>取得を登録</h2>
      <label style={S.fieldLabel}>取得日</label>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={S.input} />

      <label style={S.fieldLabel}>
        取得時間（分）
        <span style={S.hint}>ボタンで入れるか、分を直接入力できます。あなたの1日は {daily}分。</span>
      </label>
      <div style={S.quickRow}>
        <button type="button" style={S.quickBtn} onClick={() => pick(daily, "")}>
          1日（{daily}分）
        </button>
        <button type="button" style={S.quickBtn} onClick={() => pick(AM_MIN, "午前")}>
          午前（{AM_MIN}分）
        </button>
        <button type="button" style={S.quickBtn} onClick={() => pick(pmMin, "午後")}>
          {pmLabel}
        </button>
      </div>
      <input
        type="number"
        placeholder={`分を入力（空欄なら${suggested}分）`}
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        style={S.input}
      />

      <label style={S.fieldLabel}>メモ（任意）</label>
      <input type="text" placeholder="午前 / 午後 など" value={memo} onChange={(e) => setMemo(e.target.value)} style={S.input} />

      <button onClick={submit} style={{ ...S.btnPrimary, opacity: busy ? 0.6 : 1 }} disabled={busy}>
        {busy ? "登録中…" : "登録する"}
      </button>
      <p style={S.noteSmall}>登録すると院長に通知が届きます。</p>
    </section>
  );
}

function GrantsCard({ bal }) {
  return (
    <section style={S.card}>
      <h2 style={S.cardTitle}>付与の履歴</h2>
      {bal.grants.length === 0 ? (
        <p style={S.empty}>まだ付与日が来ていません。</p>
      ) : (
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>付与日</th>
              <th style={S.th}>区分</th>
              <th style={S.thR}>日数</th>
              <th style={S.th}>状態</th>
            </tr>
          </thead>
          <tbody>
            {bal.grants
              .slice()
              .reverse()
              .map((g) => {
                const isActive = bal.active.some((a) => a.grantDate === g.grantDate);
                return (
                  <tr key={g.grantDate}>
                    <td style={S.td}>{fmt(g.grantDate)}</td>
                    <td style={S.td}>{g.label}</td>
                    <td style={S.tdR}>{g.days}日</td>
                    <td style={S.td}>
                      <span style={isActive ? S.tagActive : S.tagExpired}>{isActive ? "有効" : "時効"}</span>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      )}
      <p style={S.noteSmall}>付与日から2年で時効。有効な付与のみ残数に算入。</p>
    </section>
  );
}
