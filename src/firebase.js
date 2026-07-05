// Firebase の初期化と、認証・Firestore のエクスポート
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/* ログインID方式:
   スタッフは「ログインID + パスワード」でログインする。
   Firebase Authはメール形式を要求するため、内部で疑似メールに変換する。
   （@を含む入力はそのままメールとして扱う＝院長の既存ログイン用） */
export const STAFF_EMAIL_DOMAIN = "staff.yukyu-kanri.local";
export function loginIdToEmail(idOrEmail) {
  const v = String(idOrEmail || "").trim();
  return v.includes("@") ? v : `${v.toLowerCase()}@${STAFF_EMAIL_DOMAIN}`;
}

export function login(idOrEmail, password) {
  return signInWithEmailAndPassword(auth, loginIdToEmail(idOrEmail), password);
}

/* 院長のログインを維持したままスタッフのアカウントを作るため、
   2つ目のFirebase接続(secondary)上でユーザー作成する定番パターン */
export async function createStaffAccount(loginId, password) {
  const secondary =
    getApps().find((a) => a.name === "secondary") || initializeApp(firebaseConfig, "secondary");
  const sAuth = getAuth(secondary);
  const cred = await createUserWithEmailAndPassword(sAuth, loginIdToEmail(loginId), password);
  const uid = cred.user.uid;
  await fbSignOut(sAuth);
  return uid;
}

/* 本人によるパスワード変更（現在のパスワードで再認証してから変更） */
export async function changePassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error("not-signed-in");
  const cred = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, cred);
  await updatePassword(user, newPassword);
}
export function logout() {
  return fbSignOut(auth);
}
export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}
export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}
