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
- `staff/{uid}`: { name, role, loginId, joinDate "YYYY-MM-DD", workDaysPerWeek, dailyMinutes, minutesPerDay: {sun..sat: 分}, status?: "active"|"retired", retiredDate? }
  - status="retired" は退職者。一覧・カレンダー・計画年休・管理簿・自動反映から除外され、本人ログインは「退職済み」でブロック。復帰は unretireStaff。完全削除は deleteStaffCompletely（記録ごと。Authはコンソールで別途削除）。
- `staff/{uid}/leaveRecords/{id}`: { date, minutes, type: "normal"|"planned", memo, plannedId?, createdAt }
- `notifications/{id}`: { staffUid, staffName, action, date, minutes, read, createdAt }
- `plannedLeaves/{id}`: { date, memo, status: "pending"|"applied", createdAt }（計画年休の予約。到来分は起動時に applyDuePlannedLeaves で全スタッフの記録へ自動反映）
  - applyDuePlannedLeavesは冪等: 反映済も毎回チェックし、後から登録/曜日設定したスタッフに追い反映（plannedIdで重複防止・入職前日付はスキップ・退職者除外）。
  - 反映済の取消は cancelPlannedLeave（全スタッフのplannedId一致記録を削除して残高を戻し、予定も削除）。計画年休タブの「取消して記録も戻す」。
  - 代理登録で区分=計画年休にした記録は個人だけのもの（plannedIdなし・台帳に載らない）。plannedIdなしの計画年休記録は履歴から編集・削除できる。

## 計算ロジック（lib/leave.js）— 変更時は特に慎重に
- GRANT_TABLE: 週所定日数別の比例付与（労基法）。付与は入職6ヶ月後、以後1年ごと。
- calcBalance: FIFO消化。各取得は「取得日時点で有効だった付与」から古い順に消化し、残 = 有効な付与（2年以内）の未消化分。時効切れ付与から消化済みの取得は残を減らさない（過去分のさかのぼり入力対応）。lapsedMin（時効消滅分）も返す。単位は「分」。
- fiveDayProgress: 年5日取得義務。直近基準日から1年、10日以上付与が対象。status: done/danger(期限90日以内)/warn(ペース遅れ)/ontrack。
- expiringGrants: FIFO消化（calcBalanceと同じfifoConsume）後の残りで時効消滅を警告（90日以内）。
- 日付計算（addMonths/todayStr）で toISOString() は使わない（UTC変換でJSTは1日ずれる）。ローカルタイムの toDateStr を使う。
- calcUpcomingPlanned: 次回付与日までの計画年休見込み。

## 主要機能（壊してはいけないもの）
- 院長タブ: 🏠ホーム(要対応・30日以内の予定) / 職員(カードUI・年5日義務バー) / カレンダー(同日重複⚠) / 計画年休 / 通知 / スタッフ管理(退職・復帰・完全削除) / 🖨管理簿
- 本人画面プレビュー: 職員の申請履歴から「👀 本人画面を開く」→ ログアウトせずStaffViewを院長が閲覧・入力できる（StaffViewのimpersonated prop。通知なし・パスワード変更カード非表示）。
- 代理登録は連続入力（保存後もフォームが開いたまま・n件目表示）+「1日休み/半日」プリセット。
- 2025年末までは日単位運用だった（MINUTES_ERA_START="2026-01-01"）。それ以前の日付では日数モードに自動切替・分入力は無効・注意表示。過去分は「日数×平均分」で入れる（当時の実診療時間で入れると日単位の帳尻がずれる）。
- 年次有給休暇管理簿の印刷（PrintLedger、createPortalでbody直下、.yk-printクラス。1人1ページ）
- トースト+取消（登録・削除の直後に巻き戻せる。Toast.jsx）
- スタッフ側: ヒーロー(残・5日義務バー・時効警告)、ミニカレンダー日タップで取得日設定

## 作業ルール
1. 変更前に方針を短く説明し、承認を得てからコードを書く。
2. 変更後は必ず `npm run build` と `npm test` を実行し、`✅ all passed` を確認してから納品する。
3. 新機能には tests/ui-test.mjs にチェックを追加する。計算ロジックは tests/leave-test.mjs（TZ=Asia/Tokyo固定のユニットテスト）にも追加。
4. 印刷を変えたら tests/print-preview.mjs でHTML抽出→weasyprint等でPDF化し目視確認する。
5. 納品は完全なファイルで。反映手順はターミナルコピペ形式で提示。

## ハマりどころ
- 印刷で position:absolute を使うと改ページ(page-break)が効かなくなる → createPortal + 「body > *:not(.yk-print){display:none}」方式を守る。
- 日本語IME: Enter処理は `e.nativeEvent.isComposing` でガード（Login済み）。
- 単位は常に「分」。表示も分がメイン（「10080分（約21.0日分）」形式。日数はdailyMinutes=平均で割った目安）。曜日で勤務分が違う（510分/440分など）ため日数は「約」を付ける。印刷用管理簿と年5日義務だけは日数ベース。
- addLeaveRecord / addPlannedLeave はドキュメントIDを返す（トースト取消で使用）。
- テストのモックは new Date() から相対日付で組む（実行日に依存させない）。
