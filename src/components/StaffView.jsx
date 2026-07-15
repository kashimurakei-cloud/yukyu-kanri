import React, { useEffect, useMemo, useState } from "react";
import { calcBalance, nextGrant, calcUpcomingPlanned, fiveDayProgress, expiringGrants, fmt, todayStr, weekdayKeyOf } from "../lib/leave";
import { getLeaveRecords, addLeaveRecord, getPlannedLeaves, deleteLeaveRecord } from "../data";
import { changePassword } from "../firebase";
import Toast from "./Toast";
import { S } from "../styles";

// impersonated=true のとき: 院長がログアウトせずに本人画面をプレビュー・代理入力するモード。
// 通知は送らず、パスワード変更カードは表示しない（院長自身のパスワードが変わってしまうため）。
export default function StaffView({ me, impersonated = false }) {
  const [records, setRecords] = useState([]);
  const [planned, setPlanned] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const toastTimer = React.useRef(null);
  const showToast = (msg, onUndo) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, onUndo });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

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
  const five = useMemo(() => fiveDayProgress(me, records), [me, records]);
  const expiring = useMemo(() => expiringGrants(me, records), [me, records]);

  async function handleAdd(rec) {
    const newId = await addLeaveRecord(me.id, me.name, rec, !impersonated);
    await reload();
    showToast(`✓ ${fmt(rec.date)} の取得を登録しました`, async () => {
      await deleteLeaveRecord(me.id, newId);
      await reload();
    });
  }

  // 本人が取り消せるのは「未来日（取得日が今日より後）の通常取得」だけ
  function canCancel(r) {
    return r.type !== "planned" && r.date > todayStr();
  }
  async function handleCancel(r) {
    if (!canCancel(r)) return;
    try {
      const backup = { date: r.date, minutes: r.minutes, type: r.type, memo: r.memo || "" };
      await deleteLeaveRecord(me.id, r.id);
      await reload();
      showToast(`🗑 ${fmt(r.date)} の取得を取り消しました`, async () => {
        await addLeaveRecord(me.id, me.name, backup, false);
        await reload();
      });
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
          {bal.remainMin.toLocaleString()}
          <span style={S.heroDayUnit}>分</span>
          <span style={S.heroSub}>（約{(bal.remainMin / daily).toFixed(1)}日分 ／ 1日=平均{daily}分）</span>
        </div>
        {upcoming.minutes > 0 && (
          <div style={S.forecastBox}>
            <div style={S.forecastRow}>
              <span>次回付与までの計画年休（予定）</span>
              <span style={S.forecastMinus}>−{upcoming.minutes}分（約{(upcoming.minutes / daily).toFixed(1)}日分）</span>
            </div>
            <div style={{ ...S.forecastRow, fontWeight: 700 }}>
              <span>差引の見込み残</span>
              <span style={{ color: forecastMin < 0 ? "#ffd2c8" : "#fff" }}>
                {forecastMin}分（約{(forecastMin / daily).toFixed(1)}日分）
              </span>
            </div>
          </div>
        )}
        {five && (
          <div style={S.forecastBox}>
            <div style={S.forecastRow}>
              <span>年5日取得義務（{fmt(five.deadline)}まで）</span>
              <span style={{ fontWeight: 800 }}>
                {five.takenDays.toFixed(1)} / 5日
                {five.need > 0 ? `（あと${five.need.toFixed(1)}日）` : "　達成 ✓"}
              </span>
            </div>
            <div style={{ height: 7, background: "rgba(255,255,255,0.25)", borderRadius: 99, marginTop: 4 }}>
              <div style={{
                height: "100%", borderRadius: 99,
                background: five.status === "danger" ? "#ffb3a5" : "#fff",
                width: `${Math.min(100, (five.takenDays / 5) * 100)}%`,
              }} />
            </div>
          </div>
        )}
        {expiring.length > 0 && (
          <div style={{ ...S.forecastBox, background: "rgba(255,210,200,0.25)" }}>
            {expiring.map((e, i) => (
              <div key={i} style={S.forecastRow}>
                <span>⏳ 使わないと消えてしまう分</span>
                <span style={{ fontWeight: 800 }}>{e.remainMin}分・約{e.remainDays.toFixed(1)}日分（{fmt(e.expireDate)}に時効）</span>
              </div>
            ))}
          </div>
        )}
        {bal.overflowMin > 0 && (
          <div style={{ ...S.forecastBox, background: "rgba(255,180,165,0.35)" }}>
            <div style={S.forecastRow}>
              <span>⚠ 超過取得（有給残とは別枠・院長が別途対応）</span>
              <span style={{ fontWeight: 800 }}>{bal.overflowMin}分</span>
            </div>
          </div>
        )}
        <div style={S.heroMeta}>
          <span>付与合計 {bal.grantedMin.toLocaleString()}分（約{(bal.grantedMin / daily).toFixed(1)}日分）</span>
          <span style={S.dot}>•</span>
          <span>取得済 {bal.usedMin.toLocaleString()}分（約{(bal.usedMin / daily).toFixed(1)}日分）</span>
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
                  {it.minutes}分（約{(it.minutes / daily).toFixed(1)}日分）
                  {it.memo ? ` ／ ${it.memo}` : ""}
                </span>
              </li>
            ))}
          </ul>
          <p style={S.noteSmall}>これらは予定です。日付が来ると自動で有給から引かれます。</p>
        </section>
      )}

      <div className="grid2" style={S.grid2}>
        <AddRecordCard staff={me} onAdd={handleAdd} records={records} remainMin={bal.remainMin} />
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
                    {r.minutes}分
                    <span style={S.minSub}>（約{(r.minutes / daily).toFixed(1)}日分）</span>
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

      {!impersonated && <PasswordCard showToast={showToast} />}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

/* 本人によるパスワード変更 */
function PasswordCard({ showToast }) {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [next2, setNext2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if ((next || "").length < 6) { setError("新しいパスワードは6文字以上にしてください。"); return; }
    if (next !== next2) { setError("新しいパスワード（確認）が一致しません。"); return; }
    setBusy(true);
    try {
      await changePassword(cur, next);
      setCur(""); setNext(""); setNext2(""); setOpen(false);
      showToast("✓ パスワードを変更しました");
    } catch (e) {
      console.error(e);
      if (e.code === "auth/wrong-password" || e.code === "auth/invalid-credential") {
        setError("現在のパスワードが違います。");
      } else if (e.code === "auth/weak-password") {
        setError("そのパスワードは使えません。6文字以上にしてください。");
      } else {
        setError("変更に失敗しました。通信状態を確認してください。");
      }
    }
    setBusy(false);
  }

  return (
    <section style={S.card}>
      <div style={S.notifHead}>
        <h2 style={S.cardTitle}>🔑 パスワード変更</h2>
        {!open && <button style={S.btnGhost} onClick={() => setOpen(true)}>変更する</button>}
      </div>
      {open && (
        <>
          <label style={S.fieldLabel}>現在のパスワード</label>
          <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} style={S.input} autoComplete="current-password" />
          <label style={S.fieldLabel}>新しいパスワード（6文字以上・自分の好きなもの）</label>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} style={S.input} autoComplete="new-password" />
          <label style={S.fieldLabel}>新しいパスワード（確認）</label>
          <input type="password" value={next2} onChange={(e) => setNext2(e.target.value)} style={S.input} autoComplete="new-password" />
          {error && <div style={S.errorBox}>{error}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button onClick={submit} style={{ ...S.btnPrimary, marginTop: 0, opacity: busy ? 0.6 : 1 }} disabled={busy}>
              {busy ? "変更中…" : "変更する"}
            </button>
            <button onClick={() => { setOpen(false); setError(""); }} style={{ ...S.btnGhost, padding: "12px 20px" }}>キャンセル</button>
          </div>
        </>
      )}
      {!open && <p style={S.noteSmall}>初期パスワードから自分の好きなパスワードに変更できます。忘れた場合は院長に伝えてください（再発行できます）。</p>}
    </section>
  );
}

/* 日タップで取得日を選ぶミニカレンダー */
function MiniPickCal({ value, onPick, records }) {
  const init = value ? new Date(value + "T00:00:00") : new Date();
  const [ym, setYm] = useState({ y: init.getFullYear(), m: init.getMonth() + 1 });
  const WD = ["日", "月", "火", "水", "木", "金", "土"];
  const move = (d) => setYm(({ y, m }) => {
    let nm = m + d, ny = y;
    if (nm < 1) { nm = 12; ny--; }
    if (nm > 12) { nm = 1; ny++; }
    return { y: ny, m: nm };
  });
  const dim = new Date(ym.y, ym.m, 0).getDate();
  const first = new Date(ym.y, ym.m - 1, 1).getDay();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  const today = todayStr();
  const mine = new Set((records || []).map((r) => r.date));
  return (
    <div style={{ border: "1px solid #e2ded5", borderRadius: 12, padding: "10px 12px", marginBottom: 10, background: "#fcfbf9" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
        <button type="button" style={S.btnGhost} onClick={() => move(-1)}>◀</button>
        <span style={{ flex: 1, textAlign: "center", fontWeight: 800, fontSize: 14 }}>{ym.y}年 {ym.m}月</span>
        <button type="button" style={S.btnGhost} onClick={() => move(1)}>▶</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
        {WD.map((w, i) => (
          <div key={"h" + i} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 800, color: i === 0 ? "#b4341f" : i === 6 ? "#2a6fb0" : "#8a857a" }}>{w}</div>
        ))}
        {cells.map((d, i) => {
          if (d == null) return <div key={i} />;
          const ds = `${ym.y}-${String(ym.m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const sel = ds === value;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPick(ds)}
              style={{
                padding: "7px 0", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                border: sel ? "2px solid #3a7d6e" : "1px solid transparent",
                background: sel ? "#e3efea" : ds === today ? "#f1ede3" : "transparent",
                color: mine.has(ds) ? "#3a7d6e" : "#1f2421",
                position: "relative",
              }}
            >
              {d}
              {mine.has(ds) && <span style={{ position: "absolute", bottom: 1, left: "50%", transform: "translateX(-50%)", fontSize: 7, color: "#3a7d6e" }}>●</span>}
            </button>
          );
        })}
      </div>
      <p style={{ ...S.noteSmall, margin: "6px 0 0" }}>日をタップで取得日に設定。●＝登録済みの日。</p>
    </div>
  );
}

function AddRecordCard({ staff, onAdd, records, remainMin = Infinity }) {
  const [date, setDate] = useState(todayStr());
  const [minutes, setMinutes] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);

  const daily = staff.dailyMinutes || 480;
  // 選んだ日の曜日に応じた実分数（スタッフ登録の「曜日ごとの勤務分」から取る）
  // 1日 = その曜日の勤務分、午前 = 260分固定、午後 = 1日 − 260分
  // 勤務分0の曜日（休診日・非勤務日）はボタンを出さず、分の直接入力のみ。
  const wk = weekdayKeyOf(date);
  const rawDayMin = staff.minutesPerDay?.[wk] ?? 0;
  const isWorkday = rawDayMin > 0;
  const dayMin = rawDayMin || daily;
  const suggested = isWorkday ? rawDayMin : 0;
  const AM_MIN = 260;
  const pmMin = Math.max(dayMin - AM_MIN, 0);

  function pick(m, note) {
    setMinutes(String(m));
    if (note && !memo) setMemo(note);
  }

  // 入力中の分数が残りを超えていないか
  const previewMin = Number(minutes || suggested) || 0;
  const isOver = previewMin > 0 && previewMin > remainMin;

  async function submit() {
    const m = Number(minutes || suggested);
    if (!date || !m) return;
    if (m > remainMin && !window.confirm(
      `残り${remainMin}分を超えています（${m}分）。\n超過分は有給残とは別枠で記録され、院長が別途対応します。登録しますか?`
    )) return;
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
      <label style={S.fieldLabel}>取得日（カレンダーの日をタップ）</label>
      <MiniPickCal value={date} onPick={setDate} records={records} />
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={S.input} />

      <label style={S.fieldLabel}>
        取得時間（分）
        {isWorkday && <span style={S.hint}>ボタンは選んだ日の曜日に合わせて自動計算されます。</span>}
      </label>
      {isWorkday ? (
        <div style={S.quickRow}>
          <button type="button" style={S.quickBtn} onClick={() => pick(dayMin, "")}>
            1日（{dayMin}分）
          </button>
          <button type="button" style={S.quickBtn} onClick={() => pick(AM_MIN, "午前")}>
            午前（{AM_MIN}分）
          </button>
          <button type="button" style={S.quickBtn} onClick={() => pick(pmMin, "午後")}>
            午後（{pmMin}分）
          </button>
        </div>
      ) : (
        <p style={{ ...S.noteSmall, margin: "4px 0 8px" }}>
          この日はあなたの勤務日ではありません。取得する場合は下に分数を直接入力してください。
        </p>
      )}
      <label style={S.fieldLabel}>
        分数を直接入力もできます
        <span style={S.hint}>例: 60、120 など（ボタン以外の時間はここに）</span>
      </label>
      <input
        type="number"
        inputMode="numeric"
        placeholder={isWorkday ? `分を入力（空欄なら1日=${suggested}分）` : "分を入力"}
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        style={S.input}
      />

      {isOver && (
        <div style={S.errorBox}>
          ⚠ 入力した{previewMin}分は、有給の残り{remainMin}分を超えています。
        </div>
      )}

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
              <th style={S.thR}>付与分</th>
              <th style={S.th}>消化状況</th>
              <th style={S.th}>状態</th>
            </tr>
          </thead>
          <tbody>
            {bal.grants
              .slice()
              .reverse()
              .map((g) => {
                const isActive = bal.active.some((a) => a.grantDate === g.grantDate);
                const first = g.alloc?.[0];
                const last = g.alloc?.[g.alloc.length - 1];
                return (
                  <tr key={g.grantDate}>
                    <td style={S.td}>{fmt(g.grantDate)}</td>
                    <td style={S.td}>{g.label}</td>
                    <td style={S.tdR}>{g.minutes.toLocaleString()}分<span style={S.minSub}>（{g.days}日）</span></td>
                    <td style={S.td}>
                      {g.consumedMin > 0 ? (
                        <>
                          {g.consumedMin.toLocaleString()}分 消化
                          <span style={S.minSub}>
                            （{fmt(first.date)}{g.alloc.length > 1 ? `〜${fmt(last.date)}` : ""}の取得）
                          </span>
                        </>
                      ) : (
                        "未消化"
                      )}
                      {isActive && g.leftMin > 0 && (
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#2f6358" }}>
                          残り {g.leftMin.toLocaleString()}分
                        </div>
                      )}
                      {!isActive && g.leftMin > 0 && (
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#b4341f" }}>
                          {g.leftMin.toLocaleString()}分 時効消滅
                        </div>
                      )}
                    </td>
                    <td style={S.td}>
                      <span style={isActive ? S.tagActive : S.tagExpired}>{isActive ? "有効" : "時効"}</span>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      )}
      <p style={S.noteSmall}>
        付与日から2年で時効。有効な付与のみ残数に算入。
        取得は古い付与から順に消化されます（どの取得がどの付与から引かれたかは「消化状況」の期間でわかります）。
      </p>
    </section>
  );
}
