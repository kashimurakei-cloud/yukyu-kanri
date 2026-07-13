import React, { useEffect, useState } from "react";
import { calcBalance, nextGrant, calcUpcomingPlanned, fmt, todayStr, weekdayKeyOf } from "../lib/leave";
import {
  getAllStaff,
  getLeaveRecords,
  getNotifications,
  markAllNotificationsRead,
  getPlannedLeaves,
  addPlannedLeave,
  deletePlannedLeave,
  applyDuePlannedLeaves,
  updateLeaveRecord,
  deleteLeaveRecord,
  addLeaveRecord,
} from "../data";
import StaffManager from "./StaffManager";
import StaffView from "./StaffView";
import OwnerHome, { LeaveCalendar, analyzeAll } from "./OwnerHome";
import PrintLedger from "./PrintLedger";
import Toast from "./Toast";
import { fiveDayProgress, expiringGrants } from "../lib/leave";
import { S } from "../styles";

export default function OwnerView({ me }) {
  const [tab, setTab] = useState("home");
  const [toast, setToast] = useState(null);
  const toastTimer = React.useRef(null);
  const showToast = (msg, onUndo) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, onUndo });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };
  const [focusStaffId, setFocusStaffId] = useState(null);
  const [previewStaffId, setPreviewStaffId] = useState(null); // 本人画面プレビュー中のスタッフ
  const [staffList, setStaffList] = useState([]);
  const [retiredList, setRetiredList] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [plannedLeaves, setPlannedLeaves] = useState([]);
  const [recordsByStaff, setRecordsByStaff] = useState({});
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    try {
      const all = await getAllStaff();
      // 起動時に、到来した計画年休を反映（予約方式の自動引き落とし）
      await applyDuePlannedLeaves(all);

      const staffAll = all.filter((s) => s.role === "staff");
      const staffOnly = staffAll.filter((s) => s.status !== "retired");
      setStaffList(staffOnly);
      setRetiredList(staffAll.filter((s) => s.status === "retired"));
      const map = {};
      await Promise.all(
        staffOnly.map(async (s) => {
          map[s.id] = await getLeaveRecords(s.id);
        })
      );
      setRecordsByStaff(map);
      setNotifications(await getNotifications());
      setPlannedLeaves(await getPlannedLeaves());
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }
  useEffect(() => {
    reload();
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  async function handleMarkAllRead() {
    await markAllNotificationsRead(notifications);
    setNotifications(await getNotifications());
  }

  async function handleAddPlanned(date, memo) {
    await addPlannedLeave(date, memo);
    await reload();
  }

  async function handleDeletePlanned(id) {
    await deletePlannedLeave(id);
    await reload();
  }

  const pendingPlanned = plannedLeaves.filter((p) => p.status !== "applied");

  // 本人画面プレビュー（ログアウト不要。入力もできる。通知なし）
  const previewStaff = staffList.find((s) => s.id === previewStaffId);
  if (previewStaff) {
    return (
      <>
        <div style={{
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          background: "#2d4a56", color: "#fff", borderRadius: 12,
          padding: "10px 16px", marginBottom: 14, fontSize: 13.5, fontWeight: 700,
        }}>
          <span>👀 {previewStaff.name} さんの画面を表示中（院長モード・入力もできます／本人への通知は出ません）</span>
          <button
            style={{ ...S.btnGhost, marginLeft: "auto", background: "#fff" }}
            onClick={async () => { setPreviewStaffId(null); await reload(); }}
          >
            ← 院長画面に戻る
          </button>
        </div>
        <StaffView key={previewStaff.id} me={previewStaff} impersonated />
      </>
    );
  }

  return (
    <>
      <div style={S.tabBar}>
        <button style={tab === "home" ? S.tabActive : S.tab} onClick={() => setTab("home")}>🏠 ホーム</button>
        <button style={tab === "overview" ? S.tabActive : S.tab} onClick={() => setTab("overview")}>職員</button>
        <button style={tab === "cal" ? S.tabActive : S.tab} onClick={() => setTab("cal")}>カレンダー</button>
        <button style={tab === "planned" ? S.tabActive : S.tab} onClick={() => setTab("planned")}>計画年休</button>
        <button style={tab === "notif" ? S.tabActive : S.tab} onClick={() => setTab("notif")}>
          通知{unreadCount > 0 && <span style={S.badge}>{unreadCount}</span>}
        </button>
        <button style={tab === "manage" ? S.tabActive : S.tab} onClick={() => setTab("manage")}>スタッフ管理</button>
        <button style={{ ...S.tab, marginLeft: "auto" }} onClick={() => window.print()}>🖨 管理簿</button>
      </div>

      {loading && <p style={S.empty}>読み込み中…</p>}

      {!loading && tab === "home" && (
        <OwnerHome
          staffList={staffList}
          recordsByStaff={recordsByStaff}
          pendingPlanned={pendingPlanned}
          onOpenStaff={(uid) => { setFocusStaffId(uid); setTab("overview"); }}
          onGoTab={setTab}
        />
      )}

      {!loading && tab === "cal" && (
        <LeaveCalendar staffList={staffList} recordsByStaff={recordsByStaff} pendingPlanned={pendingPlanned} />
      )}

      {!loading && tab === "overview" && (
        <OverviewTab
          staffList={staffList}
          recordsByStaff={recordsByStaff}
          pendingPlanned={pendingPlanned}
          onChanged={reload}
          showToast={showToast}
          focusStaffId={focusStaffId}
          onFocusDone={() => setFocusStaffId(null)}
          onPreview={setPreviewStaffId}
        />
      )}

      {!loading && tab === "planned" && (
        <PlannedTab
          plannedLeaves={plannedLeaves}
          onAdd={handleAddPlanned}
          onDelete={handleDeletePlanned}
          staffList={staffList}
          recordsByStaff={recordsByStaff}
        />
      )}

      {!loading && tab === "notif" && (
        <NotifTab notifications={notifications} unreadCount={unreadCount} onMarkAll={handleMarkAllRead} />
      )}

      {!loading && tab === "manage" && (
        <StaffManager staffList={staffList} retiredList={retiredList} onChanged={reload} />
      )}

      <PrintLedger staffList={staffList} recordsByStaff={recordsByStaff} />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

/* ------- 職員(カードUI) ------- */
function OverviewTab({ staffList, recordsByStaff, pendingPlanned, onChanged, showToast, focusStaffId, onFocusDone, onPreview }) {
  const [selectedId, setSelectedId] = useState(null);
  const selected = staffList.find((s) => s.id === selectedId);
  const rows = analyzeAll(staffList, recordsByStaff, pendingPlanned);

  // ホームの要対応から飛んできたら該当職員を開く
  useEffect(() => {
    if (focusStaffId) {
      setSelectedId(focusStaffId);
      onFocusDone?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusStaffId]);

  return (
    <>
      <section style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {rows.map(({ s, bal, ng, forecast, five, expiring }) => {
            const remainDays = bal.remainMin / bal.daily;
            const low = forecast < 0;
            const warn5 = forecast >= 0 && forecast < bal.daily * 5;
            const fiveColor = !five ? null
              : five.status === "done" ? "#2f7d4f"
              : five.status === "danger" ? "#b4341f"
              : five.status === "warn" ? "#b07a1f" : "#3a7d6e";
            return (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id === selectedId ? null : s.id)}
                style={{
                  textAlign: "left", background: "#fff", cursor: "pointer",
                  border: s.id === selectedId ? "2px solid #3a7d6e" : "1px solid #e2ded5",
                  borderRadius: 16, padding: "16px 18px",
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 800 }}>{s.name}</span>
                  <span style={{ fontSize: 11.5, color: "#8a857a" }}>週{s.workDaysPerWeek}日</span>
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, margin: "6px 0 2px" }}>
                  {bal.remainMin.toLocaleString()}<span style={{ fontSize: 13 }}>分</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#8a857a", marginLeft: 8 }}>残（約{remainDays.toFixed(1)}日分）</span>
                </div>
                {five && (
                  <div style={{ margin: "8px 0 2px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, fontWeight: 700, color: fiveColor }}>
                      <span>年5日義務 {five.takenDays.toFixed(1)}/5日</span>
                      <span>
                        {five.status === "done" ? "達成 ✓"
                          : five.status === "danger" ? `⚠ 期限まで${five.daysLeft}日`
                          : five.status === "warn" ? "ペース遅れ" : "順調"}
                      </span>
                    </div>
                    <div style={{ height: 6, background: "#eee9df", borderRadius: 99, marginTop: 3 }}>
                      <div style={{
                        height: "100%", borderRadius: 99, background: fiveColor,
                        width: `${Math.min(100, (five.takenDays / 5) * 100)}%`,
                      }} />
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
                  {low && <span style={S.warnTag}>残不足見込み</span>}
                  {warn5 && <span style={S.cautionTag}>5日割れ見込み</span>}
                  {expiring.map((e, i) => (
                    <span key={i} style={S.cautionTag}>⏳{e.remainMin}分 {fmt(e.expireDate)}消滅</span>
                  ))}
                </div>
                <div style={{ fontSize: 11.5, color: "#8a857a", marginTop: 8 }}>
                  次回付与 {ng ? `${fmt(ng.grantDate)}（${ng.days}日）` : "—"}
                </div>
              </button>
            );
          })}
        </div>
        {staffList.length === 0 && (
          <p style={S.empty}>まだスタッフが登録されていません。「スタッフ管理」から追加してください。</p>
        )}
      </section>

      {false && (
      <section style={S.card}>
        <h2 style={S.cardTitle}>全スタッフの有給状況</h2>
        {staffList.length === 0 ? (
          <p style={S.empty}>まだスタッフが登録されていません。「スタッフ管理」から追加してください。</p>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>氏名</th>
                <th style={S.th}>入職日</th>
                <th style={S.th}>週/1日</th>
                <th style={S.thR}>残</th>
                <th style={S.thR}>計画年休予定</th>
                <th style={S.thR}>見込み残</th>
                <th style={S.th}>次回付与</th>
                <th style={S.th}></th>
              </tr>
            </thead>
            <tbody>
              {staffList.map((s) => {
                const bal = calcBalance(s, recordsByStaff[s.id] || []);
                const ng = nextGrant(s.joinDate, s.workDaysPerWeek);
                const up = calcUpcomingPlanned(s, pendingPlanned);
                const forecast = bal.remainMin - up.minutes;
                const low = forecast < 0;
                const warn = forecast >= 0 && forecast < bal.daily * 5; // 5日割れ注意
                return (
                  <tr key={s.id}>
                    <td style={S.tdBold}>{s.name}</td>
                    <td style={S.td}>{fmt(s.joinDate)}</td>
                    <td style={S.td}>週{s.workDaysPerWeek}・{s.dailyMinutes}分</td>
                    <td style={S.tdR}>
                      {(bal.remainMin / bal.daily).toFixed(1)}日分
                    </td>
                    <td style={S.tdR}>
                      {up.minutes > 0 ? `−${(up.minutes / bal.daily).toFixed(1)}日分` : "—"}
                    </td>
                    <td style={{ ...S.tdR, fontWeight: 700, color: low ? "#b4341f" : warn ? "#b07a1f" : "#1a1a1a" }}>
                      {(forecast / bal.daily).toFixed(1)}日分
                      {low && <span style={S.warnTag}>不足</span>}
                      {warn && <span style={S.cautionTag}>5日割れ</span>}
                    </td>
                    <td style={S.td}>{ng ? `${fmt(ng.grantDate)}（${ng.days}日）` : "—"}</td>
                    <td style={S.td}>
                      <button style={S.linkBtn} onClick={() => setSelectedId(s.id)}>履歴を見る</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p style={S.noteSmall}>
          「見込み残」＝現在の残から、次回付与までの計画年休予定を引いた見込み。
          赤=不足、橙=自由分5日を割り込む可能性。判断の目安です（自動では引きません）。
        </p>
      </section>
      )}

      {selected && (
        <StaffHistoryCard
          staff={selected}
          records={recordsByStaff[selected.id] || []}
          onClose={() => setSelectedId(null)}
          onChanged={onChanged}
          showToast={showToast}
          onPreview={onPreview}
        />
      )}
    </>
  );
}

function StaffHistoryCard({ staff, records, onClose, onChanged, showToast, onPreview }) {
  const bal = calcBalance(staff, records);
  const daily = bal.daily;
  const sorted = [...records].sort((a, b) => (a.date < b.date ? 1 : -1));
  const ng = nextGrant(staff.joinDate, staff.workDaysPerWeek);
  const [editing, setEditing] = useState(null);
  const [showProxy, setShowProxy] = useState(false);

  async function handleProxyAdd(rec) {
    const newId = await addLeaveRecord(staff.id, staff.name, rec, false); // 代理登録は通知なし
    await onChanged(); // フォームは閉じない（過去分の連続入力用）
    showToast?.(`✓ ${staff.name}さんの取得（${fmt(rec.date)}）を登録しました`, async () => {
      await deleteLeaveRecord(staff.id, newId);
      await onChanged();
    });
  }

  async function handleDelete(r) {
    if (r.type === "planned") return;
    try {
      const backup = { date: r.date, minutes: r.minutes, type: r.type, memo: r.memo || "" };
      await deleteLeaveRecord(staff.id, r.id);
      await onChanged();
      showToast?.(`🗑 ${fmt(r.date)} の取得を削除しました`, async () => {
        await addLeaveRecord(staff.id, staff.name, backup, false);
        await onChanged();
      });
    } catch (e) {
      console.error(e);
      alert("削除に失敗しました。");
    }
  }

  async function handleSaveEdit(patch) {
    try {
      await updateLeaveRecord(staff.id, editing.id, patch);
      setEditing(null);
      await onChanged();
    } catch (e) {
      console.error(e);
      alert("更新に失敗しました。");
    }
  }

  return (
    <section style={{ ...S.card, border: "1.5px solid #3a7d6e" }}>
      <div style={S.notifHead}>
        <h2 style={S.cardTitle}>{staff.name} さんの申請履歴</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => onPreview?.(staff.id)} style={S.btnGhost}>👀 本人画面を開く</button>
          <button onClick={onClose} style={S.btnGhost}>閉じる</button>
        </div>
      </div>
      <div className="histSummary" style={S.histSummary}>
        <Stat label="残" main={`${bal.remainMin.toLocaleString()}分`} sub={`約${(bal.remainMin / daily).toFixed(1)}日分`} />
        <Stat label="付与合計" main={`${bal.grantedMin.toLocaleString()}分`} sub={`約${(bal.grantedMin / daily).toFixed(1)}日分`} />
        <Stat label="取得済" main={`${bal.usedMin.toLocaleString()}分`} sub={`約${(bal.usedMin / daily).toFixed(1)}日分`} />
        <Stat label="次回付与" main={ng ? fmt(ng.grantDate) : "—"} sub={ng ? `${ng.days}日` : ""} />
      </div>
      <h3 style={S.subTitle}>取得履歴</h3>
      {sorted.length === 0 ? (
        <p style={S.empty}>取得記録はありません。</p>
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
            {sorted.map((r) => (
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
                  {r.type !== "planned" && (
                    <span style={{ display: "flex", gap: 6 }}>
                      <button style={S.linkBtn} onClick={() => setEditing(r)}>編集</button>
                      <button style={{ ...S.linkBtn, color: "#b4341f", borderColor: "#e3b5ad" }} onClick={() => handleDelete(r)}>削除</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p style={S.noteSmall}>
        通常の取得は編集・削除できます。計画年休の記録は計画年休タブで管理するため、ここでは変更できません。
      </p>

      <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${"#e2ded5"}` }}>
        {!showProxy ? (
          <button style={S.btnGhost} onClick={() => setShowProxy(true)}>
            ＋ 院長が代理で取得を登録（過去分の入力にも）
          </button>
        ) : (
          <ProxyAddForm staff={staff} onAdd={handleProxyAdd} onCancel={() => setShowProxy(false)} />
        )}
      </div>

      {editing && (
        <EditRecordModal
          record={editing}
          daily={daily}
          onCancel={() => setEditing(null)}
          onSave={handleSaveEdit}
        />
      )}
    </section>
  );
}

// 院長による代理登録フォーム。過去日OK。区分（通常/計画年休）を選べる。
// 入力は「日数」または「分」のどちらでも。日数→分はその人の1日分で換算。
function ProxyAddForm({ staff, onAdd, onCancel }) {
  const daily = staff.dailyMinutes || 480;
  const [date, setDate] = useState(todayStr());
  const [mode, setMode] = useState("days"); // "days" or "minutes"
  const [days, setDays] = useState("1");
  const [minutes, setMinutes] = useState(String(daily));
  const [type, setType] = useState("normal");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [lastSaved, setLastSaved] = useState(null);

  const computedMin = mode === "days" ? Math.round(Number(days || 0) * daily) : Number(minutes || 0);

  async function submit() {
    if (!date || !computedMin) return;
    setBusy(true);
    try {
      await onAdd({ date, minutes: computedMin, type, memo });
      // 連続入力: フォームは開いたまま。メモだけクリアして次の入力へ。
      // 日付は残す（過去分入力で近い日付を続けて入れやすいように）。
      setSavedCount((n) => n + 1);
      setLastSaved(date);
      setMemo("");
    } catch (e) {
      console.error(e);
      alert("登録に失敗しました。");
    }
    setBusy(false);
  }

  return (
    <div style={{ background: "#fbfaf7", border: `1px solid ${"#e2ded5"}`, borderRadius: 12, padding: 16 }}>
      <h3 style={S.subTitle}>代理で取得を登録</h3>

      <label style={S.fieldLabel}>取得日（過去の日付もOK）</label>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={S.input} />

      <label style={S.fieldLabel}>区分</label>
      <div style={S.quickRow}>
        <button type="button" style={type === "normal" ? S.quickBtnOn : S.quickBtn} onClick={() => setType("normal")}>通常取得</button>
        <button type="button" style={type === "planned" ? S.quickBtnOn : S.quickBtn} onClick={() => setType("planned")}>計画年休</button>
      </div>

      <label style={S.fieldLabel}>
        取得量の入力方法
        <span style={S.hint}>昔の1日単位の記録は「日数」で。1日={daily}分で換算します。</span>
      </label>
      <div style={S.quickRow}>
        <button
          type="button"
          style={mode === "days" && Number(days) === 1 ? S.quickBtnOn : S.quickBtn}
          onClick={() => { setMode("days"); setDays("1"); }}
        >
          1日休み（{daily}分）
        </button>
        <button
          type="button"
          style={mode === "days" && Number(days) === 0.5 ? S.quickBtnOn : S.quickBtn}
          onClick={() => { setMode("days"); setDays("0.5"); }}
        >
          半日（{daily / 2}分）
        </button>
        <button type="button" style={mode === "minutes" ? S.quickBtnOn : S.quickBtn} onClick={() => setMode("minutes")}>分で入力</button>
      </div>

      {mode === "days" ? (
        <>
          <label style={S.fieldLabel}>日数（0.5＝半日も可）</label>
          <input type="number" step="0.5" value={days} onChange={(e) => setDays(e.target.value)} style={S.input} />
          <p style={S.noteSmall}>→ 保存される分：{computedMin}分（{(computedMin / daily).toFixed(1)}日分）</p>
        </>
      ) : (
        <>
          <label style={S.fieldLabel}>分</label>
          <input type="number" value={minutes} onChange={(e) => setMinutes(e.target.value)} style={S.input} />
          <p style={S.noteSmall}>→ {(computedMin / daily).toFixed(1)}日分</p>
        </>
      )}

      <label style={S.fieldLabel}>メモ（任意）</label>
      <input type="text" placeholder="過去分 など" value={memo} onChange={(e) => setMemo(e.target.value)} style={S.input} />

      {savedCount > 0 && (
        <p style={{ ...S.noteSmall, color: "#3a7d6e", fontWeight: 600 }}>
          ✓ {fmt(lastSaved)} を登録しました（この画面で{savedCount}件目）。続けて入力できます。
        </p>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button style={{ ...S.btnPrimary, marginTop: 0, opacity: busy ? 0.6 : 1 }} onClick={submit} disabled={busy}>
          {busy ? "登録中…" : savedCount > 0 ? "続けて登録する" : "登録する"}
        </button>
        <button style={{ ...S.btnGhost, padding: "12px 20px" }} onClick={onCancel}>
          {savedCount > 0 ? "閉じる" : "キャンセル"}
        </button>
      </div>
    </div>
  );
}

function EditRecordModal({ record, daily, onCancel, onSave }) {
  const [date, setDate] = useState(record.date);
  const [minutes, setMinutes] = useState(String(record.minutes));
  const [memo, setMemo] = useState(record.memo || "");

  return (
    <div style={S.modalOverlay}>
      <div style={S.modalCard}>
        <h3 style={S.subTitle}>取得記録を編集</h3>
        <label style={S.fieldLabel}>取得日</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={S.input} />
        <label style={S.fieldLabel}>取得時間（分）<span style={S.hint}>1日={daily}分</span></label>
        <input type="number" value={minutes} onChange={(e) => setMinutes(e.target.value)} style={S.input} />
        <label style={S.fieldLabel}>メモ</label>
        <input type="text" value={memo} onChange={(e) => setMemo(e.target.value)} style={S.input} />
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button
            style={{ ...S.btnPrimary, marginTop: 0 }}
            onClick={() => onSave({ date, minutes: Number(minutes) || 0, memo })}
          >
            保存
          </button>
          <button style={{ ...S.btnGhost, padding: "12px 20px" }} onClick={onCancel}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, main, sub }) {
  return (
    <div style={S.histStat}>
      <div style={S.histStatLabel}>{label}</div>
      <div style={S.histStatValue}>{main}</div>
      <div style={S.histStatSub}>{sub}</div>
    </div>
  );
}

/* ------- 計画年休 ------- */
function PlannedTab({ plannedLeaves, onAdd, onDelete, staffList, recordsByStaff }) {
  const [date, setDate] = useState(todayStr());
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);

  const pending = plannedLeaves.filter((p) => p.status !== "applied");
  const affected = staffList
    .map((s) => {
      const m = s.minutesPerDay?.[weekdayKeyOf(date)] ?? 0;
      const bal = calcBalance(s, recordsByStaff[s.id] || []);
      const up = calcUpcomingPlanned(s, pending);
      const afterMin = bal.remainMin - up.minutes - m;
      return { name: s.name, m, daily: bal.daily, afterMin };
    })
    .filter((x) => x.m > 0);

  const alreadyExists = pending.some((p) => p.date === date);

  async function submit() {
    setBusy(true);
    try {
      await onAdd(date, memo);
      setMemo("");
    } catch (e) {
      console.error(e);
      alert("登録に失敗しました。");
    }
    setBusy(false);
  }

  return (
    <>
      <section style={S.card}>
        <h2 style={S.cardTitle}>計画年休を予定として登録</h2>
        <p style={S.noteSmall}>
          ここで登録するのは「予定」です。すぐには引かれず、その日が来たら自動で各自の分が引かれます。
          年間の計画年休を前もってまとめて登録できます。
        </p>
        <label style={S.fieldLabel}>計画年休の日付</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={S.input} />
        <label style={S.fieldLabel}>メモ（任意）</label>
        <input type="text" placeholder="夏季一斉休診 など" value={memo} onChange={(e) => setMemo(e.target.value)} style={S.input} />

        <div style={S.preview}>
          <div style={S.previewLabel}>この日に反映される人と、反映後の見込み残</div>
          {affected.length === 0 ? (
            <div style={S.empty}>この日が勤務日のスタッフはいません。</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {affected.map((a) => {
                const low = a.afterMin < 0;
                const warn = a.afterMin >= 0 && a.afterMin < a.daily * 5;
                return (
                  <div key={a.name} style={S.affectRow}>
                    <span>{a.name}（{a.m}分）</span>
                    <span style={{ fontWeight: 700, color: low ? "#b4341f" : warn ? "#b07a1f" : "#2f6358" }}>
                      反映後 {a.afterMin.toLocaleString()}分（約{(a.afterMin / a.daily).toFixed(1)}日分）
                      {low && <span style={S.warnTag}>不足</span>}
                      {warn && <span style={S.cautionTag}>5日割れ</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {alreadyExists && (
          <div style={{ ...S.errorBox, background: "#fff7e6", color: "#8a6d2f" }}>
            この日付の計画年休予定は既に登録されています。重複登録に注意してください。
          </div>
        )}

        <button onClick={submit} style={{ ...S.btnPrimary, opacity: busy || affected.length === 0 ? 0.6 : 1 }} disabled={busy || affected.length === 0}>
          {busy ? "登録中…" : "予定として登録する"}
        </button>
        <p style={S.noteSmall}>
          「不足」「5日割れ」が出た人は、計画年休ではなく特別休暇などの対応を検討してください（アプリは自動では切り替えません）。
        </p>
      </section>

      <section style={S.card}>
        <h2 style={S.cardTitle}>計画年休の予定一覧</h2>
        {plannedLeaves.length === 0 ? (
          <p style={S.empty}>まだ登録されていません。</p>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>日付</th>
                <th style={S.th}>メモ</th>
                <th style={S.th}>状態</th>
                <th style={S.th}></th>
              </tr>
            </thead>
            <tbody>
              {plannedLeaves.map((p) => (
                <tr key={p.id}>
                  <td style={S.tdBold}>{fmt(p.date)}</td>
                  <td style={S.tdMemo}>{p.memo || "計画年休"}</td>
                  <td style={S.td}>
                    <span style={p.status === "applied" ? S.tagExpired : S.tagActive}>
                      {p.status === "applied" ? "反映済" : "予定"}
                    </span>
                  </td>
                  <td style={S.td}>
                    {p.status !== "applied" && (
                      <button
                        style={S.linkBtn}
                        onClick={() => {
                          if (confirm(`${fmt(p.date)} の計画年休予定を取り消しますか？`)) onDelete(p.id);
                        }}
                      >
                        取消
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={S.noteSmall}>「予定」は取り消せます。「反映済」は既に各自の有給から引かれています。</p>
      </section>
    </>
  );
}

/* ------- 通知 ------- */
function NotifTab({ notifications, unreadCount, onMarkAll }) {
  return (
    <section style={S.card}>
      <div style={S.notifHead}>
        <h2 style={S.cardTitle}>通知</h2>
        {unreadCount > 0 && (
          <button onClick={onMarkAll} style={S.btnGhost}>すべて既読にする</button>
        )}
      </div>
      {notifications.length === 0 ? (
        <p style={S.empty}>新しい通知はありません。スタッフが取得を登録するとここに届きます。</p>
      ) : (
        <ul style={S.notifList}>
          {notifications.map((n) => (
            <li key={n.id} style={n.read ? S.notifItem : S.notifItemUnread}>
              <div>
                <strong>{n.staffName}</strong> さんが{n.action}
                <div style={S.notifMeta}>{fmt(n.date)} ／ {n.minutes}分</div>
              </div>
              {!n.read && <span style={S.unreadDot} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
