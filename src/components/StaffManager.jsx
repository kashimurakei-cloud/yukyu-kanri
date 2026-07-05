import React, { useState } from "react";
import { upsertStaff, migrateStaffData } from "../data";
import { createStaffAccount } from "../firebase";
import { WEEKDAYS } from "../lib/leave";
import { S } from "../styles";

/*
  スタッフ管理：院長がスタッフの登録・編集を全て行う。
  新規登録では「氏名・ログインID・初期パスワード」からログインアカウントも同時に作成する
  （secondary接続でcreateUserするので院長のログインは切れない）。
  パスワードを忘れたスタッフには「アカウント再発行」：
  院長がFirebaseコンソールで旧ユーザーを削除 → ここで新しい初期パスワードで再発行 → 記録は自動引き継ぎ。
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
  const [loginId, setLoginId] = useState(initial?.loginId || "");
  const [initPassword, setInitPassword] = useState("");
  const [reissuePw, setReissuePw] = useState("");
  const [reissueBusy, setReissueBusy] = useState(false);
  const [reissueMsg, setReissueMsg] = useState("");
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
    if (!name) { setError("氏名を入力してください。"); return; }
    if (!joinDate) { setError("入職日を入力してください。"); return; }
    if (!isEdit) {
      if (!/^[a-z0-9_-]{3,20}$/i.test(loginId)) {
        setError("ログインIDは半角英数字3〜20文字で入力してください（例: hanako）。"); return;
      }
      if ((initPassword || "").length < 6) {
        setError("初期パスワードは6文字以上にしてください。"); return;
      }
    }
    setBusy(true);
    try {
      const staffData = {
        name,
        role: "staff",
        loginId: loginId.toLowerCase(),
        joinDate,
        workDaysPerWeek: Number(workDaysPerWeek),
        dailyMinutes: Number(dailyMinutes),
        minutesPerDay,
      };
      if (isEdit) {
        await upsertStaff(initial.id, staffData);
      } else {
        const uid = await createStaffAccount(loginId, initPassword);
        await upsertStaff(uid, staffData);
      }
      onSaved();
    } catch (e) {
      console.error(e);
      if (e.code === "auth/email-already-in-use") {
        setError("このログインIDはすでに使われています。別のIDにしてください。");
      } else if (e.code === "auth/weak-password") {
        setError("パスワードが弱すぎます。6文字以上にしてください。");
      } else {
        setError("保存に失敗しました。通信状態を確認してください。");
      }
    }
    setBusy(false);
  }

  /* パスワードを忘れたスタッフのアカウント再発行（記録は引き継ぎ） */
  async function reissue() {
    setError(""); setReissueMsg("");
    if ((reissuePw || "").length < 6) { setError("新しい初期パスワードは6文字以上にしてください。"); return; }
    setReissueBusy(true);
    try {
      const newUid = await createStaffAccount(loginId, reissuePw);
      await migrateStaffData(initial.id, newUid);
      setReissueMsg(`再発行しました。新しい初期パスワードを${name}さんに伝えてください（本人が後から変更できます）。`);
      setReissuePw("");
      onSaved();
    } catch (e) {
      console.error(e);
      if (e.code === "auth/email-already-in-use") {
        setError("先にFirebaseコンソール（Authentication）で、このスタッフの旧アカウントを削除してください。");
      } else {
        setError("再発行に失敗しました。通信状態を確認してください。");
      }
    }
    setReissueBusy(false);
  }

  return (
    <section style={S.card}>
      <h2 style={S.cardTitle}>{isEdit ? "スタッフを編集" : "新規スタッフを登録"}</h2>

      <label style={S.fieldLabel}>氏名</label>
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={S.input} placeholder="武田 秀美" />

      {!isEdit ? (
        <div className="grid2" style={S.grid2}>
          <div>
            <label style={S.fieldLabel}>
              ログインID
              <span style={S.hint}>半角英数字。本人がログインに使います（例: hanako）</span>
            </label>
            <input
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              style={S.input}
              placeholder="hanako"
              autoCapitalize="none"
            />
          </div>
          <div>
            <label style={S.fieldLabel}>
              初期パスワード
              <span style={S.hint}>6文字以上。本人に伝え、後で本人が変更できます</span>
            </label>
            <input
              type="text"
              value={initPassword}
              onChange={(e) => setInitPassword(e.target.value)}
              style={S.input}
              placeholder="6文字以上"
              autoCapitalize="none"
            />
          </div>
        </div>
      ) : (
        <>
          <label style={S.fieldLabel}>ログインID（変更不可）</label>
          <input type="text" value={loginId || "（旧方式：未設定）"} style={{ ...S.input, opacity: 0.6 }} disabled />
        </>
      )}

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

      {isEdit && loginId && (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px dashed #e2ded5" }}>
          <h3 style={S.subTitle}>🔑 パスワードを忘れた場合（アカウント再発行）</h3>
          <p style={S.noteSmall}>
            手順: ① Firebaseコンソールの Authentication で「{loginId}@staff.yukyu-kanri.local」のユーザーを削除
            → ② 下に新しい初期パスワードを入れて再発行。取得記録は自動で引き継がれます。
          </p>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
            <input
              type="text"
              value={reissuePw}
              onChange={(e) => setReissuePw(e.target.value)}
              style={{ ...S.input, flex: 1 }}
              placeholder="新しい初期パスワード（6文字以上）"
              autoCapitalize="none"
            />
            <button
              onClick={reissue}
              style={{ ...S.btnGhost, padding: "11px 16px", whiteSpace: "nowrap", opacity: reissueBusy ? 0.6 : 1 }}
              disabled={reissueBusy}
            >
              {reissueBusy ? "再発行中…" : "再発行"}
            </button>
          </div>
          {reissueMsg && <div style={{ ...S.errorBox, background: "#e8f3ee", color: "#2f6358" }}>{reissueMsg}</div>}
        </div>
      )}
    </section>
  );
}
