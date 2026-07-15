import React, { useState } from "react";
import { upsertStaff, migrateStaffData, retireStaff, unretireStaff, deleteStaffCompletely } from "../data";
import { createStaffAccount } from "../firebase";
import { WEEKDAYS, todayStr, fmt, calcGrants } from "../lib/leave";
import { S } from "../styles";

// 常勤/非常勤（employmentType未設定の古いデータは週5以上を常勤とみなす）
export function empTypeOf(s) {
  return s.employmentType || (Number(s.workDaysPerWeek) >= 5 ? "full" : "part");
}
export const EMP_LABEL = { full: "常勤", part: "非常勤" };

/*
  スタッフ管理：院長がスタッフの登録・編集を全て行う。
  新規登録では「氏名・ログインID・初期パスワード」からログインアカウントも同時に作成する
  （secondary接続でcreateUserするので院長のログインは切れない）。
  パスワードを忘れたスタッフには「アカウント再発行」：
  院長がFirebaseコンソールで旧ユーザーを削除 → ここで新しい初期パスワードで再発行 → 記録は自動引き継ぎ。
*/
export default function StaffManager({ staffList, retiredList = [], onChanged }) {
  const [editing, setEditing] = useState(null); // 編集中のスタッフ or null
  const [creating, setCreating] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  async function handleUnretire(s) {
    if (!window.confirm(`${s.name} さんを在籍に戻しますか?`)) return;
    await unretireStaff(s.id);
    onChanged();
  }

  async function handleDelete(s) {
    if (!window.confirm(
      `${s.name} さんを完全に削除します。\n取得記録もすべて消え、元に戻せません。\n（退職しただけなら「退職にする」を使ってください）\n\n本当に削除しますか?`
    )) return false;
    if (!window.confirm(`最終確認: ${s.name} さんのデータを完全削除します。よろしいですか?`)) return false;
    try {
      await deleteStaffCompletely(s.id);
      onChanged();
      if (s.loginId) {
        alert(
          `削除しました。\nログインアカウントを消すには、Firebaseコンソール（Authentication）で\n「${s.loginId}@staff.yukyu-kanri.local」も削除してください（手順書の④と同じ操作）。`
        );
      }
      return true;
    } catch (e) {
      console.error(e);
      alert("削除に失敗しました。");
      return false;
    }
  }

  return (
    <>
      <section style={S.card}>
        <div style={S.notifHead}>
          <h2 style={S.cardTitle}>スタッフ管理</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={S.btnGhost} onClick={() => setShowGuide(true)}>
              📖 再発行の手順書
            </button>
            <button style={S.btnGhost} onClick={() => { setCreating(true); setEditing(null); }}>
              ＋ 新規スタッフ
            </button>
          </div>
        </div>

        {staffList.length === 0 ? (
          <p style={S.empty}>まだスタッフが登録されていません。</p>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>氏名</th>
                <th style={S.th}>区分</th>
                <th style={S.th}>入職日</th>
                <th style={S.th}>週/1日</th>
                <th style={S.th}></th>
              </tr>
            </thead>
            <tbody>
              {[...staffList]
                .sort((a, b) => {
                  const t = (empTypeOf(a) === "full" ? 0 : 1) - (empTypeOf(b) === "full" ? 0 : 1);
                  if (t !== 0) return t;
                  return (a.joinDate || "") < (b.joinDate || "") ? -1 : 1;
                })
                .map((s) => (
                <tr key={s.id}>
                  <td style={S.tdBold}>{s.name}</td>
                  <td style={S.td}>
                    <span style={empTypeOf(s) === "full" ? S.tagActive : S.tagPlan}>{EMP_LABEL[empTypeOf(s)]}</span>
                  </td>
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

      {retiredList.length > 0 && (
        <section style={{ ...S.card, opacity: 0.92 }}>
          <h2 style={S.cardTitle}>🗄 退職者（記録は保存されています）</h2>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>氏名</th>
                <th style={S.th}>入職日</th>
                <th style={S.th}>退職日</th>
                <th style={S.th}></th>
              </tr>
            </thead>
            <tbody>
              {retiredList.map((s) => (
                <tr key={s.id}>
                  <td style={S.tdBold}>{s.name}</td>
                  <td style={S.td}>{fmt(s.joinDate)}</td>
                  <td style={S.td}>{fmt(s.retiredDate)}</td>
                  <td style={S.td}>
                    <span style={{ display: "flex", gap: 6 }}>
                      <button style={S.linkBtn} onClick={() => handleUnretire(s)}>在籍に戻す</button>
                      <button
                        style={{ ...S.linkBtn, color: "#b4341f", borderColor: "#e3b5ad" }}
                        onClick={() => handleDelete(s)}
                      >
                        完全削除
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={S.noteSmall}>
            退職者は一覧・カレンダー・計画年休・管理簿に出ません。本人がログインすると「退職済み」と表示されます。
          </p>
        </section>
      )}

      {(creating || editing) && (
        <StaffForm
          initial={editing}
          onCancel={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); onChanged(); }}
          onOpenGuide={() => setShowGuide(true)}
          onDelete={editing ? async () => { if (await handleDelete(editing)) setEditing(null); } : null}
        />
      )}

      {showGuide && <ReissueGuide onClose={() => setShowGuide(false)} />}
    </>
  );
}

/* ============ 📖 アカウント再発行の手順書 ============ */
function ReissueGuide({ onClose }) {
  const Step = ({ n, title, children }) => (
    <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
      <div style={{
        flexShrink: 0, width: 28, height: 28, borderRadius: "50%",
        background: "#3a7d6e", color: "#fff", fontWeight: 800, fontSize: 14,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>{n}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.7, color: "#4a4a44" }}>{children}</div>
      </div>
    </div>
  );
  const Code = ({ children }) => (
    <span style={{ background: "#f0ede5", borderRadius: 6, padding: "1px 7px", fontSize: 12.5, fontWeight: 700 }}>
      {children}
    </span>
  );
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div
        style={{ ...S.modalCard, maxWidth: 560, maxHeight: "85vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ ...S.cardTitle, fontSize: 18 }}>📖 アカウント再発行の手順書</h2>
        <p style={{ fontSize: 13, lineHeight: 1.7, color: "#4a4a44", marginTop: 0 }}>
          スタッフが<strong>パスワードを忘れたとき</strong>に使います。
          所要時間は3分ほど。<strong>有給の記録・残日数はすべて自動で引き継がれる</strong>ので安心してください。
        </p>

        <div style={{ background: "#fff7e6", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, lineHeight: 1.7, color: "#8a6d2f", marginBottom: 16 }}>
          <strong>先に知っておくこと</strong><br />
          ・初期パスワードは登録時に院長が入力したものです。アプリからは後から確認できません（安全のため、どこにも保存されません）。忘れられたら「調べる」のではなく「再発行する」が正解です。<br />
          ・本人がまだログインできるなら再発行は不要です。本人の画面の「🔑パスワード変更」を案内してください。
        </div>

        <Step n={1} title="Firebaseコンソールを開く">
          パソコンのブラウザで <Code>console.firebase.google.com</Code> を開き、
          このアプリを作ったときのGoogleアカウントでログイン →
          プロジェクト（yukyu-kanri）をクリックします。
        </Step>

        <Step n={2} title="ユーザー一覧を開く">
          左メニューの <Code>構築</Code> → <Code>Authentication</Code> をクリックし、
          上の <Code>Users</Code> タブを開きます。登録済みユーザーの一覧が出ます。
        </Step>

        <Step n={3} title="対象スタッフを探す">
          一覧の「ID（識別子）」列から、対象スタッフの
          <Code>ログインID@staff.yukyu-kanri.local</Code> を探します
          （例: hanakoさんなら <Code>hanako@staff.yukyu-kanri.local</Code>）。
          <br />
          <strong style={{ color: "#b4341f" }}>
            ⚠ 自分（院長）のアカウントと間違えないこと。必ず「@staff.yukyu-kanri.local」で終わる行を選ぶ。
          </strong>
        </Step>

        <Step n={4} title="旧アカウントを削除する">
          その行の右端の <Code>⋮</Code>（縦3点）をクリック → <Code>アカウントを削除</Code> → 確認。
          <br />
          ここで消えるのは「ログインの鍵」だけです。有給の記録は消えません。
        </Step>

        <Step n={5} title="アプリで再発行する">
          このアプリに戻り、<Code>スタッフ管理</Code> → 対象スタッフの <Code>編集</Code> →
          一番下の <Code>🔑 パスワードを忘れた場合（アカウント再発行）</Code> に
          <strong>新しい初期パスワード</strong>（6文字以上・院長が決める）を入力して
          <Code>再発行</Code> を押します。
          「再発行しました」と出たら成功です（記録は自動引き継ぎ済み）。
        </Step>

        <Step n={6} title="本人に伝える">
          新しい初期パスワードを本人に伝えます。本人は
          <Code>ログインID</Code>（変わりません）と新パスワードでログインし、
          画面下の <Code>🔑パスワード変更</Code> で自分の好きなパスワードに変えてもらいます。
        </Step>

        <div style={{ background: "#e8f3ee", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, lineHeight: 1.7, color: "#2f6358", marginTop: 4 }}>
          <strong>うまくいかないとき</strong><br />
          ・「先にFirebaseコンソールで旧アカウントを削除してください」と出る → 手順1〜4がまだです。順番が前後してもデータは壊れないので、削除してからもう一度「再発行」を押せばOK。<br />
          ・コンソールで対象が見つからない → ログインIDのつづりを確認。スタッフ管理の編集画面に正確な表記が出ています。
        </div>

        <button style={{ ...S.btnPrimary, marginTop: 18 }} onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}

function StaffForm({ initial, onCancel, onSaved, onOpenGuide, onDelete }) {
  const isEdit = !!initial;
  const [retireDate, setRetireDate] = useState(todayStr());
  const [retireBusy, setRetireBusy] = useState(false);

  async function retire() {
    if (!retireDate) { alert("退職日を入力してください。"); return; }
    if (!window.confirm(`${initial.name} さんを ${fmt(retireDate)} 付けで退職にしますか?\n記録は残り、「退職者」欄からいつでも戻せます。`)) return;
    setRetireBusy(true);
    try {
      await retireStaff(initial.id, retireDate);
      onSaved();
    } catch (e) {
      console.error(e);
      alert("退職処理に失敗しました。");
    }
    setRetireBusy(false);
  }
  const [loginId, setLoginId] = useState(initial?.loginId || "");
  const [initPassword, setInitPassword] = useState("");
  const [reissuePw, setReissuePw] = useState("");
  const [reissueBusy, setReissueBusy] = useState(false);
  const [reissueMsg, setReissueMsg] = useState("");
  const [name, setName] = useState(initial?.name || "");
  const [joinDate, setJoinDate] = useState(initial?.joinDate || "");
  const [workDaysPerWeek, setWorkDaysPerWeek] = useState(initial?.workDaysPerWeek || 5);
  const [dailyMinutes, setDailyMinutes] = useState(initial?.dailyMinutes || 480);
  const [employmentType, setEmploymentType] = useState(initial ? empTypeOf(initial) : "full");
  const [noGrantDates, setNoGrantDates] = useState(initial?.noGrantDates || []);

  // これまでの付与日一覧（付与なし設定のチェックボックス用）
  const grantDates = isEdit && joinDate
    ? calcGrants(joinDate, Number(workDaysPerWeek), todayStr(), []).map((g) => ({ date: g.grantDate, label: g.label, days: g.days }))
    : [];

  function toggleNoGrant(gd) {
    setNoGrantDates((prev) => prev.includes(gd) ? prev.filter((d) => d !== gd) : [...prev, gd]);
  }
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
        employmentType,
        noGrantDates,
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

      <label style={S.fieldLabel}>雇用区分（一覧の並び順に使います）</label>
      <div style={S.quickRow}>
        <button type="button" style={employmentType === "full" ? S.quickBtnOn : S.quickBtn} onClick={() => setEmploymentType("full")}>常勤</button>
        <button type="button" style={employmentType === "part" ? S.quickBtnOn : S.quickBtn} onClick={() => setEmploymentType("part")}>非常勤</button>
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

      {isEdit && grantDates.length > 0 && (
        <>
          <label style={S.fieldLabel}>
            付与なしの年（出勤率8割未満だった年にチェック）
            <span style={S.hint}>チェックした付与日は0日付与になります。勤続年数のカウントは進みます。</span>
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {grantDates.map((g) => (
              <label key={g.date} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
                <input
                  type="checkbox"
                  checked={noGrantDates.includes(g.date)}
                  onChange={() => toggleNoGrant(g.date)}
                />
                {fmt(g.date)}（{g.label}・本来{g.days}日）を付与なしにする
              </label>
            ))}
          </div>
        </>
      )}

      {error && <div style={S.errorBox}>{error}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button onClick={save} style={{ ...S.btnPrimary, marginTop: 0, opacity: busy ? 0.6 : 1 }} disabled={busy}>
          {busy ? "保存中…" : "保存"}
        </button>
        <button onClick={onCancel} style={{ ...S.btnGhost, padding: "12px 20px" }}>キャンセル</button>
      </div>

      {isEdit && loginId && (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px dashed #e2ded5" }}>
          <div style={S.notifHead}>
            <h3 style={S.subTitle}>🔑 パスワードを忘れた場合（アカウント再発行）</h3>
            <button style={S.linkBtn} onClick={onOpenGuide}>📖 詳しい手順書</button>
          </div>
          <p style={S.noteSmall}>
            かんたんに言うと: ① Firebaseコンソール（Authentication）で「{loginId}@staff.yukyu-kanri.local」を削除
            → ② 下に新しい初期パスワードを入れて再発行。取得記録は自動で引き継がれます。
            初めての場合は右上の手順書を開いてください。
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

      {isEdit && (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px dashed #e2ded5" }}>
          <h3 style={S.subTitle}>🚪 退職にする</h3>
          <p style={S.noteSmall}>
            記録は保存されたまま「退職者」欄に格納され、一覧・カレンダー・計画年休・管理簿から外れます。
            本人はログインできなくなり、「在籍に戻す」でいつでも復帰できます。
          </p>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
            <input type="date" value={retireDate} onChange={(e) => setRetireDate(e.target.value)} style={{ ...S.input, flex: 1 }} />
            <button
              onClick={retire}
              style={{ ...S.btnGhost, padding: "11px 16px", whiteSpace: "nowrap", opacity: retireBusy ? 0.6 : 1 }}
              disabled={retireBusy}
            >
              {retireBusy ? "処理中…" : "この日付で退職にする"}
            </button>
          </div>

          {onDelete && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ ...S.subTitle, color: "#b4341f" }}>⚠ 完全削除（取り消せません）</h3>
              <p style={S.noteSmall}>
                登録ミスなどでデータごと消したい場合だけ使ってください。取得記録もすべて消えます。
                退職しただけなら上の「退職にする」を使ってください。
              </p>
              <button
                onClick={onDelete}
                style={{ ...S.btnGhost, color: "#b4341f", borderColor: "#e3b5ad", marginTop: 4 }}
              >
                このスタッフを完全削除する
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
