import React, { useState } from "react";
import { upsertStaff } from "../data";
import { WEEKDAYS } from "../lib/leave";
import { S } from "../styles";

/*
  スタッフ管理：院長がスタッフ情報を登録・編集する。
  注意：ここで作るのは Firestore の staff レコードのみ。
  ログイン用の Authentication アカウントは、Firebaseコンソールで別途作成し、
  発行された UID をこの画面の「Auth UID」に貼り付けて紐づける運用。
  （ブラウザから他人のAuthアカウントを作るのはセキュリティ上避けるため）
*/
export default function StaffManager({ staffList, onChanged }) {
  const [editing, setEditing] = useState(null); // 編集中のスタッフ or null
  const [creating, setCreating] = useState(false);

  return (
    <>
      <section style={S.card}>
        <div style={S.notifHead}>
          <h2 style={S.cardTitle}>スタッフ管理</h2>
          <button style={S.btnGhost} onClick={() => { setCreating(true); setEditing(null); }}>
            ＋ 新規スタッフ
          </button>
        </div>

        {staffList.length === 0 ? (
          <p style={S.empty}>まだスタッフが登録されていません。</p>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>氏名</th>
                <th style={S.th}>入職日</th>
                <th style={S.th}>週/1日</th>
                <th style={S.th}></th>
              </tr>
            </thead>
            <tbody>
              {staffList.map((s) => (
                <tr key={s.id}>
                  <td style={S.tdBold}>{s.name}</td>
                  <td style={S.td}>{s.joinDate || "—"}</td>
                  <td style={S.td}>週{s.workDaysPerWeek}・{s.dailyMinutes}分</td>
                  <td style={S.td}>
                    <button style={S.linkBtn} onClick={() => { setEditing(s); setCreating(false); }}>編集</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {(creating || editing) && (
        <StaffForm
          initial={editing}
          onCancel={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); onChanged(); }}
        />
      )}
    </>
  );
}

function StaffForm({ initial, onCancel, onSaved }) {
  const isEdit = !!initial;
  const [uid, setUid] = useState(initial?.id || "");
  const [name, setName] = useState(initial?.name || "");
  const [joinDate, setJoinDate] = useState(initial?.joinDate || "");
  const [workDaysPerWeek, setWorkDaysPerWeek] = useState(initial?.workDaysPerWeek || 5);
  const [dailyMinutes, setDailyMinutes] = useState(initial?.dailyMinutes || 480);
  const [minutesPerDay, setMinutesPerDay] = useState(
    initial?.minutesPerDay || { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 }
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function setDay(key, val) {
    setMinutesPerDay((prev) => ({ ...prev, [key]: Number(val) || 0 }));
  }

  async function save() {
    setError("");
    if (!uid) { setError("Auth UID を入力してください（Firebaseコンソールで作成したアカウントのUID）。"); return; }
    if (!name) { setError("氏名を入力してください。"); return; }
    if (!joinDate) { setError("入職日を入力してください。"); return; }
    setBusy(true);
    try {
      await upsertStaff(uid, {
        name,
        role: "staff",
        joinDate,
        workDaysPerWeek: Number(workDaysPerWeek),
        dailyMinutes: Number(dailyMinutes),
        minutesPerDay,
      });
      onSaved();
    } catch (e) {
      console.error(e);
      setError("保存に失敗しました。UIDが正しいか、通信状態を確認してください。");
    }
    setBusy(false);
  }

  return (
    <section style={S.card}>
      <h2 style={S.cardTitle}>{isEdit ? "スタッフを編集" : "新規スタッフを登録"}</h2>

      {!isEdit && (
        <div style={{ ...S.errorBox, background: "#fff7e6", color: "#8a6d2f" }}>
          先にFirebaseコンソールの Authentication で、このスタッフのログイン用アカウント（メール＋パスワード）を作成し、
          発行された <strong>User UID</strong> を下に貼り付けてください。
        </div>
      )}

      <label style={S.fieldLabel}>Auth UID</label>
      <input
        type="text"
        value={uid}
        onChange={(e) => setUid(e.target.value)}
        style={{ ...S.input, opacity: isEdit ? 0.6 : 1 }}
        placeholder="例：KFzQB8EZH1VBNAMUKWAf8g55Y4t2"
        disabled={isEdit}
      />

      <label style={S.fieldLabel}>氏名</label>
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={S.input} placeholder="武田 秀美" />

      <label style={S.fieldLabel}>入職日</label>
      <input type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} style={S.input} />

      <div className="grid2" style={S.grid2}>
        <div>
          <label style={S.fieldLabel}>週の出勤日数</label>
          <select value={workDaysPerWeek} onChange={(e) => setWorkDaysPerWeek(e.target.value)} style={S.input}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>週{n}日</option>
            ))}
          </select>
        </div>
        <div>
          <label style={S.fieldLabel}>1日あたりの分数</label>
          <input type="number" value={dailyMinutes} onChange={(e) => setDailyMinutes(e.target.value)} style={S.input} placeholder="480" />
        </div>
      </div>

      <label style={S.fieldLabel}>
        曜日ごとの勤務分（計画年休の自動反映に使用）
        <span style={S.hint}>勤務しない曜日は0のままでOK。例：武田さん=火水金土に410。</span>
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {WEEKDAYS.map((w) => (
          <div key={w.key} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#8a857a", marginBottom: 4 }}>{w.label}</div>
            <input
              type="number"
              value={minutesPerDay[w.key] ?? 0}
              onChange={(e) => setDay(w.key, e.target.value)}
              style={{ ...S.input, padding: "6px 4px", textAlign: "center" }}
            />
          </div>
        ))}
      </div>

      {error && <div style={S.errorBox}>{error}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button onClick={save} style={{ ...S.btnPrimary, marginTop: 0, opacity: busy ? 0.6 : 1 }} disabled={busy}>
          {busy ? "保存中…" : "保存"}
        </button>
        <button onClick={onCancel} style={{ ...S.btnGhost, padding: "12px 20px" }}>キャンセル</button>
      </div>
    </section>
  );
}
