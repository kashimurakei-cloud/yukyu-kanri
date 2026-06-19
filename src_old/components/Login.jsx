import React, { useState } from "react";
import { login, resetPassword } from "../firebase";
import { S, globalCss } from "../styles";

const ERROR_MESSAGES = {
  "auth/invalid-email": "メールアドレスの形式が正しくありません。",
  "auth/user-not-found": "このメールアドレスは登録されていません。",
  "auth/wrong-password": "パスワードが違います。",
  "auth/invalid-credential": "メールアドレスまたはパスワードが違います。",
  "auth/too-many-requests": "試行回数が多すぎます。しばらく待って再度お試しください。",
};

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState("");

  async function handleLogin() {
    setError("");
    setResetMsg("");
    if (!email || !password) {
      setError("メールアドレスとパスワードを入力してください。");
      return;
    }
    setBusy(true);
    try {
      await login(email, password);
      // 成功すると App 側の watchAuth が拾って画面が切り替わる
    } catch (e) {
      setError(ERROR_MESSAGES[e.code] || "ログインに失敗しました。");
    }
    setBusy(false);
  }

  async function handleReset() {
    setError("");
    setResetMsg("");
    if (!email) {
      setError("パスワードを再設定するには、まずメールアドレスを入力してください。");
      return;
    }
    try {
      await resetPassword(email);
      setResetMsg("パスワード再設定メールを送信しました。メールを確認してください。");
    } catch (e) {
      setError(ERROR_MESSAGES[e.code] || "メール送信に失敗しました。");
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter") handleLogin();
  }

  return (
    <div style={S.loginWrap}>
      <style>{globalCss}</style>
      <div style={S.loginCard}>
        <div style={S.loginEyebrow}>すこやか歯科医院</div>
        <h1 style={S.loginTitle}>有給管理 ログイン</h1>

        <label style={S.fieldLabel}>メールアドレス</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={onKeyDown}
          style={S.input}
          placeholder="you@example.com"
          autoComplete="username"
        />

        <label style={S.fieldLabel}>パスワード</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={onKeyDown}
          style={S.input}
          placeholder="パスワード"
          autoComplete="current-password"
        />

        {error && <div style={S.errorBox}>{error}</div>}
        {resetMsg && <div style={{ ...S.errorBox, background: "#e8f3ee", color: "#2f6358" }}>{resetMsg}</div>}

        <button style={{ ...S.btnPrimary, opacity: busy ? 0.6 : 1 }} onClick={handleLogin} disabled={busy}>
          {busy ? "ログイン中…" : "ログイン"}
        </button>

        <div style={{ textAlign: "center" }}>
          <button style={S.linkText} onClick={handleReset}>
            パスワードを忘れた場合
          </button>
        </div>
      </div>
    </div>
  );
}
