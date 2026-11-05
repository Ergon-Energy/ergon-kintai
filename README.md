# Ergon 勤怠

2人の勤務時間とやったことを記録・可視化する勤怠アプリ。Slackの `/kintai` から打刻できます。

- **Slack**：`/kintai in` / `out` / `log` / `status`
- **カレンダー（トップ）**：2人の勤務を月カレンダーで表示。日付を押すとその日の記録を表示・編集・削除
- **勤怠状況（`/status`）**：2人の稼働状況、期間合計、日ごとの棒グラフ、やったことのタイムライン、画面からの打刻、CSV書き出し
- **タスク（`/tasks`）**：未着手・進行中・完了のボードで進捗を管理。担当と期限を付けられ、期限切れは赤で表示。担当で絞り込み可能。完了の列は直近30日分を表示
- **WBS（`/wbs`）**：タスクを親子の階層にした表とガントチャートを並べて表示。親の期間と進捗は配下のタスクから自動で集計。日付が片方だけのタスクは、未入力の側を作成日・完了日・今日で補ってバーを出す。「開始」を押すと、開始日が未入力ならその日を記録する。子を持つタスクはまとめとして扱い、ボードと件数には出さない
- **デザイン**：Ergon のデザインシステムの配色・書体に準拠。OS の設定に合わせて Carbon（ダーク）と Paper（ライト）が切り替わる
- **構成**：Next.js 15（App Router）＋ Supabase（Postgres）、Vercel 想定。外部ライブラリは supabase-js のみ

## Slackでの使い方

| コマンド | 内容 |
|---|---|
| `/kintai in` | 出勤（チャンネルに 🟢 で表示） |
| `/kintai in 9:30 PoC資料` | 時刻とメモを付けて出勤（打刻忘れの後付け） |
| `/kintai out 提案書を直した` | 退勤＋やったこと（🔴 と勤務時間を表示） |
| `/kintai out 18:10 …` | 時刻を指定して退勤 |
| `/kintai log MILPの高速化` | 勤務中のやったことを記録（自分にだけ表示） |
| `/kintai status` または `/kintai` | 2人の状況と今週の勤務時間（自分にだけ表示） |

- `出勤` `退勤` `作業` `状況` の日本語でも打てます。全角の数字・コロン・スペースもOK
- 時刻を指定して今より未来になる場合は前日とみなします（0:10 に `out 23:50`）
- 日付をまたぐ勤務は、グラフでは日ごとに分けて集計します
- 初めて `/kintai` を打った人は自動でメンバー登録されます（名前は Slack プロフィールの氏名。`SLACK_BOT_TOKEN` が未設定ならユーザー名。変えたいときは Supabase の `members.name` を編集）

`/kintai` はどのチャンネルでも使えるので、それぞれの個人チャンネルで打てます。記録は Slack のユーザーごとに残るので、お互いの勤怠は画面で見られます。

## セットアップ（30分くらい）

### 1. Supabase

1. [supabase.com](https://supabase.com) でプロジェクトを作成（無料枠で十分）
2. SQL Editor に `supabase/schema.sql` を貼って実行
3. Project Settings → API から **Project URL** と **service_role キー** を控える

すでに使っている環境でテーブルが増えたときも、`supabase/schema.sql` をもう一度実行すれば足りない分だけ作られます（既存のデータはそのまま）。

### 2. Vercel にデプロイ

1. このフォルダを GitHub に push し、Vercel で Import
2. Environment Variables に `.env.example` の6つを設定
   - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
   - `SLACK_SIGNING_SECRET` / `SLACK_BOT_TOKEN`（手順3で取得。先に空でデプロイして後から入れてもOK）
   - `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD`（画面を開くときのID・パスワード。2人で共有）
3. デプロイして URL を控える（例：`https://ergon-kintai.vercel.app`）

### 3. Slack アプリ

1. [api.slack.com/apps](https://api.slack.com/apps) → Create New App → **From an app manifest** → ワークスペースを選ぶ
2. `slack-manifest.yml` の中身を貼り、`YOUR-APP.vercel.app` を手順2のドメインに書き換えて作成
3. Install to Workspace
4. Basic Information → App Credentials の **Signing Secret** を Vercel の `SLACK_SIGNING_SECRET` に、OAuth & Permissions の **Bot User OAuth Token** を `SLACK_BOT_TOKEN` に入れて再デプロイ
5. Slack で `/kintai help` が返ってくれば完了

## ローカル開発

```bash
npm install
cp .env.example .env.local   # 値を入れる（BASIC_AUTH は空なら開発時は認証なし）
npm run dev                   # http://localhost:3000
npm test                      # 時刻計算・コマンド解釈・集計・署名検証のテスト
```

Slack からローカルを叩くときは `ngrok http 3000` などで公開URLを作り、Slack アプリの Slash Commands の Request URL を一時的に差し替えます。

## 構成

```
app/
  page.tsx                  カレンダー（トップ）
  status/page.tsx           勤怠状況（期間：今週/先週/今月/先月）
  tasks/page.tsx            タスクのボード
  wbs/page.tsx              WBS・ガントチャート
  actions.ts                画面からの打刻・編集・タスク操作（Server Action）
  api/slack/command/route.ts  /kintai の受け口（署名検証あり）
  api/export/route.ts       CSV書き出し（Excel向けBOM付き）
lib/
  attendance.ts             打刻・取得・集計
  tasks.ts                  タスクの取得・更新・並び順・集計
  wbs.ts                    WBSの階層・番号・集計、ガントの表示範囲
  command.ts                /kintai のテキスト解釈
  time.ts                   日本時間の日付計算
  slack.ts                  Slack署名検証
components/DailyChart.tsx   日ごとの棒グラフ（SVG）
components/AppHeader.tsx    画面の切り替え
components/Timeline.tsx     やったことのタイムライン
components/DayRecords.tsx   カレンダーで選んだ日の記録（編集・削除）
components/TaskCard.tsx     ボードのカード
components/TaskControls.tsx タスクの状態移動・編集・削除（ボードとWBSで共用）
components/WbsGantt.tsx     WBSの表とガントチャート
middleware.ts               画面とCSVの Basic 認証（/api/slack は除外）
supabase/schema.sql         テーブル定義
```

## セキュリティの考え方

- DB にはサーバーからのみ service_role キーで接続。RLS を有効にしてポリシーを作らないので、anon キーが漏れても読み書きできない
- Slack の受け口は Signing Secret の署名と5分以内のタイムスタンプで検証
- 画面は Basic 認証。本番で未設定なら開かない
- 1人につき「勤務中」は1件まで（DBの部分ユニークインデックスで保証）

## まだ無いもの（必要になったら）

- 編集履歴（ログインが2人共通のため、誰がいつ変更したかは残らない）
- 休憩の記録（今は `out` → `in` で区切る）
- 退勤し忘れのリマインド（Slack の Bot トークンを足せば、夜に勤務中の人へDMできる）
- プロジェクト・タグ別の集計（`log` に `#poc` のようなタグを付けて集計する拡張がしやすい）
