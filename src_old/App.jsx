import React, { useEffect, useState } from "react";
import { watchAuth, logout } from "./firebase";
import { getStaff } from "./data";
import Login from "./components/Login";
import StaffView from "./components/StaffView";
import OwnerView from "./components/OwnerView";
import { S, globalCss } from "./styles";

export default function App() {
  const [authUser, setAuthUser] = useState(undefined); // undefined=判定中, null=未ログイン
  const [me, setMe] = useState(null); // Firestoreのstaffドキュメント
  const [loadingMe, setLoadingMe] = useState(false);

  useEffect(() => {
    const unsub = watchAuth(async (user) => {
      setAuthUser(user);
      if (user) {
        setLoadingMe(true);
        try {
          const staff = await getStaff(user.uid);
          setMe(staff);
        } catch (e) {
          console.error(e);
          setMe(null);
        }
        setLoadingMe(false);
      } else {
        setMe(null);
      }
    });
    return unsub;
  }, []);

  // 判定中
  if (authUser === undefined) {
    return (
      <div style={S.loginWrap}>
        <style>{globalCss}</style>
        <div style={{ color: "#8a857a" }}>読み込み中…</div>
      </div>
    );
  }

  // 未ログイン
  if (!authUser) {
    return <Login />;
  }

  // ログイン済みだがstaffレコードが見つからない
  if (loadingMe) {
    return (
      <div style={S.loginWrap}>
        <style>{globalCss}</style>
        <div style={{ color: "#8a857a" }}>読み込み中…</div>
      </div>
    );
  }
  if (!me) {
    return (
      <div style={S.loginWrap}>
        <style>{globalCss}</style>
        <div style={S.loginCard}>
          <h1 style={S.loginTitle}>登録がありません</h1>
          <p style={S.empty}>
            ログインはできましたが、あなたのスタッフ情報が登録されていません。院長に登録を依頼してください。
          </p>
          <button style={S.btnPrimary} onClick={logout}>
            ログアウト
          </button>
        </div>
      </div>
    );
  }

  const isOwner = me.role === "owner";

  return (
    <div style={S.page}>
      <style>{globalCss}</style>
      <header style={S.header}>
        <div>
          <div style={S.brandEyebrow}>すこやか歯科医院</div>
          <h1 style={S.brandTitle}>有給管理</h1>
        </div>
        <div style={S.userBox}>
          <span style={S.userName}>
            {me.name}（{isOwner ? "院長" : "スタッフ"}）
          </span>
          <button style={S.btnGhost} onClick={logout}>
            ログアウト
          </button>
        </div>
      </header>
      <main style={S.main}>
        {isOwner ? <OwnerView me={me} /> : <StaffView me={me} />}
      </main>
    </div>
  );
}
