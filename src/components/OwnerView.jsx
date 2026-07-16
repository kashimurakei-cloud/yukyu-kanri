import React, { useEffect, useState } from "react";
import { calcBalance, nextGrant, calcUpcomingPlanned, fmt, fmtW, todayStr, weekdayKeyOf, addMonths, attendancePeriods, groupRecordsByPeriod } from "../lib/leave";
import {
  getAllStaff,
  getLeaveRecords,
  getNotifications,
  markAllNotificationsRead,
  getPlannedLeaves,
  addPlannedLeave,
  deletePlannedLeave,
  cancelPlannedLeave,
  applyDuePlannedLeaves,
  updateLeaveRecord,
  deleteLeaveRecord,
  addLeaveRecord,
  getAttendance,
  upsertAttendance,
  deleteAttendance,
} from "../data";
import StaffManager, { empTypeOf, EMP_LABEL } from "./StaffManager";
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

  // 反映済の計画年休を取消（各スタッフの記録も削除して残高を戻す）
  async function handleCancelApplied(id) {
    const removed = await cancelPlannedLeave(id);
    await reload();
    showToast(`✓ 計画年休を取り消しました（${removed}人分の記録を戻しました）`);
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
          onCancelApplied={handleCancelApplied}
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

  // 常勤/非常勤でグループ分け（各グループ内は入職日順）
  const groups = [
    { type: "full", label: EMP_LABEL.full, rows: [] },
    { type: "part", label: EMP_LABEL.part, rows: [] },
  ];
  for (const r of rows) {
    (empTypeOf(r.s) === "full" ? groups[0] : groups[1]).rows.push(r);
  }
  for (const g of groups) g.rows.sort((a, b) => ((a.s.joinDate || "") < (b.s.joinDate || "") ? -1 : 1));

  return (
    <>
      {groups.filter((g) => g.rows.length > 0).map((group) => (
      <section key={group.type} style={{ marginBottom: 16 }}>
        <h2 style={{ ...S.cardTitle, marginBottom: 8 }}>
          {group.label} <span style={{ fontSize: 12.5, color: "#8a857a", fontWeight: 600 }}>{group.rows.length}人</span>
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {group.rows.map(({ s, bal, ng, forecast, five, expiring }) => {
            const remainDays = bal.remainMin / bal.daily;
            // 非常勤は残不足なら計画年休が自動スキップされるため不足見込みタグは出さない
            const low = forecast < 0 && empTypeOf(s) !== "part";
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
                  {bal.recentOverflowMin > 0 && <span style={S.warnTag}>⚠超過{bal.recentOverflowMin}分</span>}
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
      </section>
      ))}
      {staffList.length === 0 && (
        <p style={S.empty}>まだスタッフが登録されていません。「スタッフ管理」から追加してください。</p>
      )}

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
  const [showAdjust, setShowAdjust] = useState(false);
  const [showAttend, setShowAttend] = useState(false);

  async function handleProxyAdd(rec) {
    const newId = await addLeaveRecord(staff.id, staff.name, rec, false); // 代理登録は通知なし
    await onChanged(); // フォームは閉じない（過去分の連続入力用）
    showToast?.(`✓ ${staff.name}さんの取得（${fmt(rec.date)}）を登録しました`, async () => {
      await deleteLeaveRecord(staff.id, newId);
      await onChanged();
    });
  }

  // 残高合わせ: 差分を「過去分一括消化」の調整記録として今日の日付で登録（FIFOで古い有効付与から消化される）
  async function handleAdjust(diffMin) {
    const newId = await addLeaveRecord(
      staff.id, staff.name,
      { date: todayStr(), minutes: diffMin, type: "adjust", memo: "過去分一括消化（残高合わせ）" },
      false
    );
    setShowAdjust(false);
    await onChanged();
    showToast(`✓ 過去分 ${diffMin}分 をまとめて消化済みにしました`, async () => {
      await deleteLeaveRecord(staff.id, newId);
      await onChanged();
    });
  }

  async function handleDelete(r) {
    // 台帳（計画年休タブ）から配られた記録はここでは消せない。代理で個別に入れた計画年休(plannedIdなし)はOK。
    if (r.type === "planned" && r.plannedId) return;
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
      {bal.recentOverflowMin > 0 ? (
        <div style={S.errorBox}>
          ⚠ 超過取得 {bal.recentOverflowMin}分
          （{bal.recentOverflowItems.map((o) => `${fmt(o.date)}の取得で${o.minutes}分`).join("、")}）。
          有給残とは<strong>別枠</strong>・残からは引いていません。
          給与控除など別途対応してください。入力ミスの場合は取得記録の分数を修正
          （2025年以前の半日は240分・1日は480分）。
          {bal.overflowMin > bal.recentOverflowMin && ` 過去の超過も累計${bal.overflowMin}分あります。`}
        </div>
      ) : bal.overflowMin > 0 ? (
        <p style={S.noteSmall}>
          ※ 過去の付与期間に超過取得が累計{bal.overflowMin}分ありました
          （{bal.overflowItems.map((o) => `${fmt(o.date)}の取得で${o.minutes}分`).join("、")}・対応済み想定・記録として保持）。
        </p>
      ) : null}
      <h3 style={S.subTitle}>取得履歴</h3>
      {sorted.length === 0 ? (
        <p style={S.empty}>取得記録はありません。</p>
      ) : (
        groupRecordsByPeriod(staff, records).map((g) => (
          <details key={g.key} open={g.isCurrent} style={{ marginBottom: 8, border: "1px solid #e2ded5", borderRadius: 10, padding: "8px 12px", background: g.isCurrent ? "#fcfbf9" : "#fff" }}>
            <summary style={{ cursor: "pointer", fontWeight: 800, fontSize: 13.5, padding: "2px 0" }}>
              {g.start ? `${fmt(g.start)}の付与から${g.isCurrent ? "（今期）" : ""}` : "初回付与前"}
              <span style={{ fontWeight: 600, color: "#8a857a", marginLeft: 8 }}>
                {g.records.length}件・計{g.totalMin.toLocaleString()}分（約{(g.totalMin / daily).toFixed(1)}日分）
              </span>
            </summary>
            <table style={S.table}>
              <tbody>
                {g.records.map((r) => (
                  <tr key={r.id}>
                    <td style={S.td}>{fmtW(r.date)}</td>
                    <td style={S.td}>
                      <span style={r.type === "planned" ? S.tagPlan : r.type === "adjust" ? S.tagExpired : S.tagNormal}>
                        {r.type === "planned" ? "計画年休" : r.type === "adjust" ? "調整" : "通常"}
                      </span>
                    </td>
                    <td style={S.tdR}>
                      {r.minutes}分
                      <span style={S.minSub}>（約{(r.minutes / daily).toFixed(1)}日分）</span>
                    </td>
                    <td style={S.tdMemo}>{r.memo || "—"}</td>
                    <td style={S.td}>
                      {(r.type !== "planned" || !r.plannedId) && (
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
          </details>
        ))
      )}
      <p style={S.noteSmall}>
        通常の取得と、代理で個別に入れた計画年休は編集・削除できます。
        計画年休タブから全員に配られた記録はタブ側で管理するため、ここでは変更できません（タブの「取消して記録も戻す」を使ってください）。
      </p>

      <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${"#e2ded5"}` }}>
        {!showProxy ? (
          <button style={S.btnGhost} onClick={() => setShowProxy(true)}>
            ＋ 院長が代理で取得を登録（過去分の入力にも）
          </button>
        ) : (
          <ProxyAddForm staff={staff} onAdd={handleProxyAdd} onCancel={() => setShowProxy(false)} remainMin={bal.remainMin} />
        )}
      </div>

      <div style={{ marginTop: 10 }}>
        {!showAdjust ? (
          <button style={S.btnGhost} onClick={() => setShowAdjust(true)}>
            🧮 残高合わせ（過去分をまとめて消化済みに）
          </button>
        ) : (
          <BalanceAdjustForm
            computedRemain={bal.remainMin}
            onAdjust={handleAdjust}
            onCancel={() => setShowAdjust(false)}
          />
        )}
      </div>

      <div style={{ marginTop: 10 }}>
        {!showAttend ? (
          <button style={S.btnGhost} onClick={() => setShowAttend(true)}>
            📋 勤怠を記録（出勤率8割の確認用・任意）
          </button>
        ) : (
          <AttendanceSection staff={staff} onClose={() => setShowAttend(false)} />
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

// 勤怠記録（出勤率8割の確認用・任意）。確認したいスタッフだけ月ごとの出勤数・欠勤数を入れる。
// 次回付与の算定期間の出勤率を自動計算し、8割未満なら「付与なし」設定を案内する。
function AttendanceSection({ staff, onClose }) {
  const [rows, setRows] = useState(null);
  const [month, setMonth] = useState(() => addMonths(todayStr(), -1).slice(0, 7)); // 先月から
  const [worked, setWorked] = useState("");
  const [absent, setAbsent] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    setRows(await getAttendance(staff.id));
  }
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff.id]);

  const periods = rows ? attendancePeriods(staff, rows) : [];

  async function save() {
    if (!month || worked === "") return;
    setBusy(true);
    try {
      await upsertAttendance(staff.id, month, Number(worked), Number(absent || 0));
      await reload();
      // 連続入力: 翌月に進めて続けて入れられる
      setMonth(addMonths(month + "-01", 1).slice(0, 7));
      setWorked("");
      setAbsent("");
    } catch (e) {
      console.error(e);
      alert("保存に失敗しました。");
    }
    setBusy(false);
  }

  async function remove(m) {
    await deleteAttendance(staff.id, m);
    await reload();
  }

  return (
    <div style={{ background: "#fbfaf7", border: `1px solid ${"#e2ded5"}`, borderRadius: 12, padding: 16 }}>
      <div style={S.notifHead}>
        <h3 style={S.subTitle}>📋 勤怠記録（出勤率8割の確認用）</h3>
        <button style={S.btnGhost} onClick={onClose}>閉じる</button>
      </div>
      <p style={S.noteSmall}>
        確認したいスタッフだけ入力すればOK。有給・計画年休で休んだ日は法律上「出勤」扱いなので出勤数に含めてください。
      </p>

      {periods.length > 0 && (
        <table style={{ ...S.table, marginBottom: 12 }}>
          <thead>
            <tr>
              <th style={S.th}>付与日</th>
              <th style={S.th}>算定期間</th>
              <th style={S.thR}>出勤/欠勤</th>
              <th style={S.thR}>出勤率</th>
              <th style={S.th}>判定</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.grantDate}>
                <td style={S.td}>{fmt(p.grantDate)}{p.future ? "（次回）" : ""}</td>
                <td style={S.td}>{fmt(p.start)}〜</td>
                <td style={S.tdR}>{p.worked}日 / {p.absent}日</td>
                <td style={{ ...S.tdR, fontWeight: 800, color: p.ok ? "#2f6358" : "#b4341f" }}>
                  {Math.round(p.rate * 100)}%
                </td>
                <td style={S.td}>
                  {p.skipped ? (
                    <span style={S.tagExpired}>付与なし設定済み</span>
                  ) : p.ok ? (
                    <span style={S.tagActive}>8割OK</span>
                  ) : (
                    <span style={S.warnTag}>8割未満 → 付与なし候補</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="grid2" style={S.grid2}>
        <div>
          <label style={S.fieldLabel}>月（◀▶で前後の月へ。保存すると自動で翌月に進みます）</label>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button type="button" style={S.btnGhost} onClick={() => setMonth(addMonths(month + "-01", -1).slice(0, 7))}>◀</button>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ ...S.input, flex: 1 }} />
            <button type="button" style={S.btnGhost} onClick={() => setMonth(addMonths(month + "-01", 1).slice(0, 7))}>▶</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={S.fieldLabel}>出勤数</label>
            <input type="number" inputMode="numeric" value={worked} onChange={(e) => setWorked(e.target.value)} style={S.input} placeholder="例: 8" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.fieldLabel}>欠勤数</label>
            <input type="number" inputMode="numeric" value={absent} onChange={(e) => setAbsent(e.target.value)} style={S.input} placeholder="例: 0" />
          </div>
        </div>
      </div>
      <button style={{ ...S.btnPrimary, marginTop: 8, opacity: busy ? 0.6 : 1 }} onClick={save} disabled={busy}>
        {busy ? "保存中…" : "この月を保存（同じ月は上書き）"}
      </button>

      {rows && rows.length > 0 && (
        <table style={{ ...S.table, marginTop: 12 }}>
          <thead>
            <tr>
              <th style={S.th}>月</th>
              <th style={S.thR}>出勤</th>
              <th style={S.thR}>欠勤</th>
              <th style={S.th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.month}>
                <td style={S.td}>{a.month.replace("-", "/")}</td>
                <td style={S.tdR}>{a.worked}日</td>
                <td style={S.tdR}>{a.absent}日</td>
                <td style={S.td}>
                  <button style={{ ...S.linkBtn, color: "#b4341f", borderColor: "#e3b5ad" }} onClick={() => remove(a.month)}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows && rows.length === 0 && <p style={S.empty}>まだ勤怠の入力はありません。</p>}
    </div>
  );
}

// 残高合わせフォーム: 「実際の残」を入れると差分を過去分一括消化として登録する。
// 勤務歴の長いスタッフの過去記録を全部入力しなくても、残高だけ正しく合わせられる。
function BalanceAdjustForm({ computedRemain, onAdjust, onCancel }) {
  const [actual, setActual] = useState("");
  const [busy, setBusy] = useState(false);
  const actualNum = Number(actual || 0);
  const diff = computedRemain - actualNum;
  const valid = actual !== "" && actualNum >= 0 && diff > 0;

  async function submit() {
    if (!valid) return;
    setBusy(true);
    try {
      await onAdjust(diff);
    } catch (e) {
      console.error(e);
      alert("調整に失敗しました。");
    }
    setBusy(false);
  }

  return (
    <div style={{ background: "#fbfaf7", border: `1px solid ${"#e2ded5"}`, borderRadius: 12, padding: 16 }}>
      <h3 style={S.subTitle}>🧮 残高合わせ（過去分をまとめて消化済みに）</h3>
      <p style={S.noteSmall}>
        過去の取得を1件ずつ入力しなくても、実際の残高に合わせられます。
        差分は「過去分一括消化」という<strong>調整</strong>記録として1件登録され、古い有効な付与から順に消化されます。
        調整分は年5日義務のカウントには入らないので、今期に実際に取った日はなるべく個別に入力してください。
      </p>
      <p style={{ fontSize: 14, fontWeight: 700 }}>計算上の残: {computedRemain.toLocaleString()}分</p>
      <label style={S.fieldLabel}>実際の残（分）</label>
      <input
        type="number"
        inputMode="numeric"
        placeholder="例: 5760"
        value={actual}
        onChange={(e) => setActual(e.target.value)}
        style={S.input}
      />
      {actual !== "" && (
        diff > 0 ? (
          <p style={S.noteSmall}>→ 差分 <strong>{diff.toLocaleString()}分</strong> を「過去分一括消化」として登録します。</p>
        ) : diff === 0 ? (
          <p style={S.noteSmall}>すでに一致しています。調整は不要です。</p>
        ) : (
          <div style={S.errorBox}>
            実際の残が計算上の残を超えています。付与を増やすことはできないので、
            入職日・週の出勤日数・取得記録が正しいか確認してください。
          </div>
        )
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button style={{ ...S.btnPrimary, marginTop: 0, opacity: busy || !valid ? 0.6 : 1 }} onClick={submit} disabled={busy || !valid}>
          {busy ? "登録中…" : "この内容で調整する"}
        </button>
        <button style={{ ...S.btnGhost, padding: "12px 20px" }} onClick={onCancel}>キャンセル</button>
      </div>
    </div>
  );
}

// 院長による代理登録フォーム。過去日OK。区分（通常/計画年休）を選べる。
// 入力は「日数」または「分」のどちらでも。日数→分はその人の1日分で換算。
// 2025年末までは日単位運用だったため、それ以前の日付では日数モードに自動切替＋注意を出す。
// （付与も取得も同じ平均分で換算すれば日単位の帳尻が合う。当時の実診療時間で入れるとずれる）
const MINUTES_ERA_START = "2026-01-01"; // 分単位で取れるようになった日
function ProxyAddForm({ staff, onAdd, onCancel, remainMin = Infinity }) {
  const daily = staff.dailyMinutes || 480;
  const [date, setDate] = useState(todayStr());
  const [mode, setMode] = useState("days"); // "days" or "minutes"
  const isDayEra = date && date < MINUTES_ERA_START;

  // 2025年以前の日付を選んだら日数モードへ自動切替
  useEffect(() => {
    if (isDayEra && mode === "minutes") setMode("days");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);
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

      {isDayEra && (
        <div style={{ ...S.errorBox, background: "#fbf4e3", color: "#7d5a14" }}>
          📅 2025年までの取得は<strong>日数で入力</strong>してください（1日＝平均{daily}分で換算されます）。
          当時の実際の診療時間（510分など）では入れないでください。付与と同じ換算にすることで日単位の帳尻が正しく合います。
        </div>
      )}

      <label style={S.fieldLabel}>区分</label>
      <div style={S.quickRow}>
        <button type="button" style={type === "normal" ? S.quickBtnOn : S.quickBtn} onClick={() => setType("normal")}>通常取得</button>
        <button type="button" style={type === "planned" ? S.quickBtnOn : S.quickBtn} onClick={() => setType("planned")}>計画年休</button>
      </div>
      {type === "planned" && (
        <p style={S.noteSmall}>
          ※ここで入れる計画年休は<strong>この人の記録としてだけ</strong>登録されます（計画年休タブの一覧には載りません）。
          全員一斉の計画年休は「計画年休」タブから登録してください。
        </p>
      )}

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
        <button
          type="button"
          style={{ ...(mode === "minutes" ? S.quickBtnOn : S.quickBtn), opacity: isDayEra ? 0.4 : 1 }}
          onClick={() => setMode("minutes")}
          disabled={isDayEra}
        >
          分で入力{isDayEra ? "（2026年〜）" : ""}
        </button>
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

      {computedMin > remainMin && (
        <div style={S.errorBox}>
          ⚠ {computedMin}分は現在の残り{remainMin}分を超えています（過去分の入力では、その日時点の付与から引かれるため問題ない場合もあります）。
        </div>
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
function PlannedTab({ plannedLeaves, onAdd, onDelete, onCancelApplied, staffList, recordsByStaff }) {
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
      return { name: s.name, m, daily: bal.daily, afterMin, isPart: empTypeOf(s) === "part", noGrant: bal.grantedMin <= 0 };
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
                      {a.noGrant || (low && a.isPart) ? (
                        <>反映されません（{a.noGrant ? "未付与" : "残不足"}）</>
                      ) : (
                        <>
                          反映後 {a.afterMin.toLocaleString()}分（約{(a.afterMin / a.daily).toFixed(1)}日分）
                          {low && <span style={S.warnTag}>不足（超過扱い）</span>}
                          {warn && <span style={S.cautionTag}>5日割れ</span>}
                        </>
                      )}
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
          残が足りない非常勤と、まだ付与されていない人には自動的に反映されません（日付が来たときに通知でお知らせします）。
          常勤は不足でも反映され、超過分は別枠で警告されます。
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
                  <td style={S.tdBold}>{fmtW(p.date)}</td>
                  <td style={S.tdMemo}>{p.memo || "計画年休"}</td>
                  <td style={S.td}>
                    <span style={p.status === "applied" ? S.tagExpired : S.tagActive}>
                      {p.status === "applied" ? "反映済" : "予定"}
                    </span>
                  </td>
                  <td style={S.td}>
                    {p.status !== "applied" ? (
                      <button
                        style={S.linkBtn}
                        onClick={() => {
                          if (confirm(`${fmt(p.date)} の計画年休予定を取り消しますか？`)) onDelete(p.id);
                        }}
                      >
                        取消
                      </button>
                    ) : (
                      <button
                        style={{ ...S.linkBtn, color: "#b4341f", borderColor: "#e3b5ad" }}
                        onClick={() => {
                          if (confirm(
                            `${fmt(p.date)} の計画年休を取り消しますか？\n各スタッフに反映済みの記録も削除され、その分の残高が戻ります。`
                          )) onCancelApplied(p.id);
                        }}
                      >
                        取消して記録も戻す
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
