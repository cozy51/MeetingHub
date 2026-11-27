# Meeting Hub

Meeting Hub は、Teams 会議、1on1、定例会などの記録と、それに紐づく資料・メモ・自分のタスクを一か所で管理する Web アプリです。会議一覧、全文検索、複合フィルター、タスク集約、詳細・編集画面を備え、データは Cloudflare D1 に保存し、Cloudflare Workers で配信します（ブラウザの `localStorage` はオフライン用のキャッシュ）。

## 構成

| 役割 | 使うもの |
| --- | --- |
| 画面 | Next.js を静的出力（`out/`）し、Cloudflare Workers の静的アセットとして配信 |
| API | `worker/index.ts`（`/api/*` だけ Worker で処理） |
| データ | Cloudflare D1（データベース名 `meeting-hub`、スキーマは `migrations/`） |
| 認証 | Cloudflare Access（Worker 側で Access の JWT を検証） |

## ローカル開発

```bash
npm install
echo 'DEV_AUTH_BYPASS=1' > .dev.vars   # ローカルでは Access の検証を省略する（本番では設定しない）
npm run db:migrate:local               # ローカルの D1 にテーブルを作成
```

画面を編集しながら開発する場合は、2 つのターミナルで次を実行し、`http://localhost:3000` を開きます（`/api/*` は自動で 8787 番へ転送されます）。

```bash
npm run dev:api
```

```bash
npm run dev
```

本番と同じ構成で確認する場合は `npm run preview`（`http://localhost:8787`）を使います。型チェックは `npm run typecheck` です。

## 主な機能

- 会議の追加・編集・削除、詳細スライドパネル（開始・終了時刻の登録に対応）
- Outlook / Teams の予定（`.ics`）からの会議登録（ボタン、または画面へのドラッグ＆ドロップ。複数ファイル可）。日付・時間帯・議題・場所・Teams リンク・分類を自動入力し、同じ予定の二重登録を防止
- 今月から3か月分のカレンダー（会議件数、タスク期限、自分／会社の休みの登録）
- 議題、メモ、タスク、分類、タグを対象にしたリアルタイム検索
- 日付、分類、場所、重要度、タスク状態を組み合わせたフィルター
- 今日・今週・重要・未完了ビューとサマリーダッシュボード
- 全会議を横断するタスク一覧とその場での完了切り替え
- ユーザー定義分類の追加・削除
- JSON による全データのバックアップと復元
- Canva スプレッドシートから移行するための CSV インポート（年月日、場所、分類、議題、リンクメモ、メモ、自分タスク、Teamsリンク）
- デスクトップ・モバイル対応

## Cloudflare へのデプロイ

### 初回セットアップ（1 回だけ）

1. **D1 データベース**: `meeting-hub` を作成し、ID を `wrangler.jsonc` の `database_id` に設定します（設定済み）。
2. **Worker の作成**: ダッシュボードの「Workers & Pages → アプリケーションを作成 → Git リポジトリをインポート」で本リポジトリを選び、次のように設定します。
   - プロジェクト名: `meeting-hub`（`wrangler.jsonc` の `name` と同じにする）
   - ビルド コマンド: `npm run build`
   - デプロイ コマンド: `npx wrangler d1 migrations apply meeting-hub --remote && npx wrangler deploy`
3. **Cloudflare Access**: デプロイ後、Worker の「設定 → ドメインとルート」で `workers.dev` の Cloudflare Access を有効にし、許可するメールアドレス（またはドメイン）をポリシーに設定します。
4. **Access の値を設定**: Zero Trust の「Access → アプリケーション」で該当アプリの **Application Audience (AUD) タグ** を、「設定」で **チーム ドメイン**（`<チーム名>.cloudflareaccess.com`）を確認し、`wrangler.jsonc` の `vars` の `ACCESS_AUD`・`ACCESS_TEAM_DOMAIN` に設定してデプロイします。どちらも秘密情報ではありません。

`ACCESS_TEAM_DOMAIN`・`ACCESS_AUD` が未設定の間、API は 503 を返し、データは読み書きされません（画面には「サーバーの設定が完了していません」と表示）。`wrangler deploy` は `wrangler.jsonc` の `vars` でダッシュボード上の変数を上書きするため、値は必ず `wrangler.jsonc` に書いてください。

以降は `main` ブランチへの push で自動デプロイされます。手元からデプロイする場合は `npx wrangler login` の後に `npm run deploy` を実行します。

### 既存データ（Google Drive 版）からの移行

URL（オリジン）が変わるため、ブラウザ内のデータは引き継がれません。旧版の「設定 → JSONエクスポート」で保存したファイルを、新しい版の「設定 → JSONインポート」で読み込むと D1 に保存されます。

### 同期の仕組み

- 「前回サーバーと一致した内容」と現在の内容を比べ、**変わった会議・分類・休みだけ**を約 1 秒後に送ります。サーバーの最新に未送信の変更を重ねて反映するので、別の端末で別の会議を編集していても上書きしません（同じ会議を両方で編集した場合は後から保存した方が残ります）。
- 画面に戻ったとき、オンラインに戻ったとき、表示中は 1 分ごとにデータの版番号を確認し、他の端末の更新を取り込みます。
- オフライン中の変更はブラウザに保持され、接続が戻ると自動で保存します。
- Access のログインが切れた場合は「再ログイン」でページを再読み込みし、ログイン後に未保存の変更を保存します。
- D1 の「タイム トラベル」機能で、過去 30 日以内の任意の時点にデータベースを戻せます。

## データ構造

`Meeting` が基本情報を持ち、複数の `MeetingLink` と `MeetingTask` を配列として参照します。分類は `Category` として独立しており、表示名を後から追加できます。型定義は `src/types/index.ts` にあります。

保存処理は `src/data/repository.ts`（ブラウザ内キャッシュ）と `src/data/cloud.ts`・`src/data/useCloudSync.ts`・`src/data/changes.ts`（D1 との差分同期）に集約し、UI コンポーネントが `localStorage` を直接操作しない構成です。初回のみ `src/data/seed.ts` のサンプルデータを投入します。

## D1 のスキーマ

| テーブル | 内容 |
| --- | --- |
| `meetings` | 会議 1 件 = 1 行。本体は `data` 列（JSON）、`date`・`title` は検索用に別列でも保持 |
| `categories` | 分類 1 件 = 1 行。`sort` が並び順 |
| `holidays` | 休み（`date` と `kind` の組） |
| `sync_meta` | データ全体の版番号（`revision`） |

スキーマを変えるときは `migrations/` に `0002_*.sql` のように SQL を追加します。デプロイ時に未適用のものだけが実行されます。
