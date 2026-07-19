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
- `staff/{uid}`: { name, role, loginId, joinDate "YYYY-MM-DD", workDaysPerWeek, dailyMinutes, minutesPerDay: {sun..sat: 分}, status?: "active"|"retired", retiredDate?, employmentType?: "full"|"part", noGrantDates?: ["YYYY-MM-DD"] }
  - employmentType: 常勤/非常勤（未設定は週5以上を常勤扱い。empTypeOf in StaffManager）。職員カードは常勤/非常勤でグループ表示・入職日順。
  - noGrantDates: 出勤率8割未満で「付与なし」にした付与日。その年は0日付与、勤続段階は進む。スタッフ編集のチェックボックスで設定。
  - noLeave?: true = 有給の付与対象外（専従者・年間所定48日未満の隔週勤務など）。calcBalance/fiveDayProgress/expiringGrants/attendance系が全て空を返し、管理簿からも除外。本人画面は案内のみ。給与明細アプリの台帳としては使われる。スタッフ編集のチェックで設定。
  - status="retired" は退職者。一覧・カレンダー・計画年休・管理簿・自動反映から除外され、本人ログインは「退職済み」でブロック。復帰は unretireStaff。完全削除は deleteStaffCompletely（記録ごと。Authはコンソールで別途削除）。
- `staff/{uid}/leaveRecords/{id}`: { date, minutes, type: "normal"|"planned", memo, plannedId?, createdAt }
- `staff/{uid}/attendance/{YYYY-MM}`: { month, worked(出勤数), absent(欠勤数) }。出勤率8割確認用の任意入力（確認したい人だけ）。履歴カードの「📋 勤怠を記録」から。attendanceRateForが次回付与の算定期間（前回付与日〜、初回は入職日〜）の率を計算。attendancePeriodsは過去の付与期間ごとの率一覧（過去数年分の後入れ対応・新しい順・入力のない期間は出さない）。8割未満は「付与なし候補」表示。有給で休んだ日は出勤に数える運用。
- `notifications/{id}`: { staffUid, staffName, action, date, minutes, read, createdAt }
- `plannedLeaves/{id}`: { date, memo, status: "pending"|"applied", createdAt }（計画年休の予約。到来分は起動時に applyDuePlannedLeaves で全スタッフの記録へ自動反映）
  - applyDuePlannedLeavesは冪等: 反映済も毎回チェックし、後から登録/曜日設定したスタッフに追い反映（plannedIdで重複防止・入職前日付はスキップ・退職者除外）。
  - 反映しないケース: ①未付与(その日時点でgrantedMin=0。入職6ヶ月未満・付与なし設定のみ)は常勤/非常勤とも、②非常勤で残不足。スキップ時は通知「残不足（または未付与）のため反映していません」（対応指示の文言は入れない方針）。常勤で付与済みは不足でも反映し超過は別枠警告。プレビューに「反映されません（未付与/残不足）」表示。
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
- 残高合わせ: 履歴カードの「🧮 残高合わせ」で実際の残(分)を入力→差分を type:"adjust"（区分タグ「調整」・メモ「過去分一括消化」）の記録として今日の日付で1件登録。FIFOで古い有効付与から消化。年5日義務・ホームの取得予定には数えない。勤務歴の長いスタッフの過去記録を全部入れなくて済む（時効2年なので有効付与は最大2つしかない）。
- 2025年末までは日単位運用だった（MINUTES_ERA_START="2026-01-01"）。それ以前の日付では日数モードに自動切替・分入力は無効・注意表示。過去分は「日数×平均分」で入れる（当時の実診療時間で入れると日単位の帳尻がずれる）。
- 年次有給休暇管理簿の印刷（PrintLedger、createPortalでbody直下、.yk-printクラス。1人1ページ）
- トースト+取消（登録・削除の直後に巻き戻せる。Toast.jsx）
- スタッフ側: ヒーロー(残・5日義務バー・時効警告)、ミニカレンダー日タップで取得日設定
- 取得ボタンは曜日連動: 1日=その曜日の勤務分(minutesPerDay)、午前=260分固定、午後=1日−260分。すこやか歯科の所定: 火金530・水木土440(午前260/午後は火金270・水木土180)。自由な分数入力も可。勤務分0の曜日はボタン非表示で自由入力のみ。
- 付与の履歴に消化状況列: calcBalanceが付与ごとに consumedMin/leftMin/alloc(いつ何分消化したか)を返し、「○分 消化（x/x〜x/xの取得）」「残り○分」「○分 時効消滅」を表示。
- 残高オーバー: calcBalanceのoverflowMin(累計)とrecentOverflowMin(直近付与日以降)。**残とは相殺しない**(翌年付与から引かない)。別枠で表示し、給与側で対応する運用。スタッフのヒーロー・職員カードのタグ・ホーム要対応はrecent(新しい付与が来たら消える)、院長の履歴カードは今期分があれば赤アラート、過去分だけなら小さな注記(「対応済み想定・記録として保持」)に格下げ。スタッフ入力時は超過警告+confirm。代理フォームは注意のみ。

## その他の運用機能
- 取得履歴は付与年ごとの折りたたみ(details/summary)。groupRecordsByPeriodでグループ化、今期だけ初期展開。見出しに「○/○の付与から（今期） n件・計○分」。スタッフ/院長両方。
- バックアップ: スタッフ管理の「💾 バックアップ」→ exportAllData()で全データ(スタッフ・記録・勤怠・計画年休・通知)をJSONダウンロード。
- 完全削除は暗証番号必須（StaffManagerのDELETE_PIN="0000"。変更はこの定数を書き換える）。
- Firestoreルール: staff/{uid}/attendance は院長のみ読み書き（コンソールで設定済み）。新しいサブコレクションを追加したらルールにもmatchブロック追加が必要。

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
