# AI向け作業メモ（yukyu-kanri / 有給管理）

このリポジトリの改修をAIに依頼するときは、このファイルを読ませること。

## プロジェクト概要
- すこやか歯科医院の有給休暇管理アプリ。React 18 + Vite 5 + Firebase 10（Auth + Firestore）。Vercelでデプロイ。
- ログイン必須。role: "owner"（院長）と "staff" で画面が分かれる。
- 構成: src/App.jsx（認証分岐のみ）、components/（Login / OwnerView / OwnerHome / StaffView / StaffManager / PrintLedger / Toast）、lib/leave.js（計算ロジック）、data.js（Firestore操作）、styles.js（Sオブジェクト+globalCss。CSSファイルは無くinline style中心）。

## 認証方式（重要）
- スタッフのログインは「ログインID + パスワード」。内部では loginIdToEmail() で `{id}@staff.yukyu-kanri.local` の疑似メールに変換してFirebase Authを使う。@を含む入力はそのままメール扱い（院長の既存ログイン用）。
- スタッフ登録は院長がアプリ内で完結: createStaffAccount() がsecondary接続でAuthユーザーを作成（院長のセッションは維持される）→ upsertStaff。
- パスワードは本人が changePassword() で変更可（再認証つき）。
- パスワードを忘れた場合: 疑似メールなので再設定メールは使えない → 院長がFirebaseコンソールで旧ユーザー削除 → スタッフ管理の「アカウント再発行」→ migrateStaffData() で記録を新UIDへ自動引き継ぎ。

## データ構造（Firestore）
- `staff/{uid}`: { name, role, loginId, joinDate "YYYY-MM-DD", workDaysPerWeek, dailyMinutes, minutesPerDay: {sun..sat: 分} }
- `staff/{uid}/leaveRecords/{id}`: { date, minutes, type: "normal"|"planned", memo, plannedId?, createdAt }
- `notifications/{id}`: { staffUid, staffName, action, date, minutes, read, createdAt }
- `plannedLeaves/{id}`: { date, memo, status: "pending"|"applied", createdAt }（計画年休の予約。到来分は起動時に applyDuePlannedLeaves で全スタッフの記録へ自動反映）

## 計算ロジック（lib/leave.js）— 変更時は特に慎重に
- GRANT_TABLE: 週所定日数別の比例付与（労基法）。付与は入職6ヶ月後、以後1年ごと。
- calcBalance: 残 = 有効な付与（付与日から2年以内）の合計 − 取得合計。単位は「分」。
- fiveDayProgress: 年5日取得義務。直近基準日から1年、10日以上付与が対象。status: done/danger(期限90日以内)/warn(ペース遅れ)/ontrack。
- expiringGrants: FIFO消化を仮定した時効消滅の警告（90日以内）。
- calcUpcomingPlanned: 次回付与日までの計画年休見込み。

## 主要機能（壊してはいけないもの）
- 院長タブ: 🏠ホーム(要対応・30日以内の予定) / 職員(カードUI・年5日義務バー) / カレンダー(同日重複⚠) / 計画年休 / 通知 / スタッフ管理 / 🖨管理簿
- 年次有給休暇管理簿の印刷（PrintLedger、createPortalでbody直下、.yk-printクラス。1人1ページ）
- トースト+取消（登録・削除の直後に巻き戻せる。Toast.jsx）
- スタッフ側: ヒーロー(残・5日義務バー・時効警告)、ミニカレンダー日タップで取得日設定

## 作業ルール
1. 変更前に方針を短く説明し、承認を得てからコードを書く。
2. 変更後は必ず `npm run build` と `npm test` を実行し、`✅ all passed` を確認してから納品する。
3. 新機能には tests/ui-test.mjs にチェックを追加する。
4. 印刷を変えたら tests/print-preview.mjs でHTML抽出→weasyprint等でPDF化し目視確認する。
5. 納品は完全なファイルで。反映手順はターミナルコピペ形式で提示。

## ハマりどころ
- 印刷で position:absolute を使うと改ページ(page-break)が効かなくなる → createPortal + 「body > *:not(.yk-print){display:none}」方式を守る。
- 日本語IME: Enter処理は `e.nativeEvent.isComposing` でガード（Login済み）。
- 単位は常に「分」。日数表示は dailyMinutes で割る。スタッフごとに1日の分数が違う。
- addLeaveRecord / addPlannedLeave はドキュメントIDを返す（トースト取消で使用）。
- テストのモックは new Date() から相対日付で組む（実行日に依存させない）。
