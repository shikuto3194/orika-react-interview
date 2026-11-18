# orika-react

このプロジェクトはVite＋Reactで構築されています。
- カードリストの仮想リスト（バーチャルスクロール）・グリッド切替UIを搭載予定
- `npm run dev` で開発サーバー起動

## 開発サーバー起動方法
```
npm run dev
```

## ビルド方法
```
npm run build
```

## 主な依存
- react
- react-dom
- react-window
- vite

## ESLint設定の拡張

本プロジェクトでは、型ありのlintルールを有効にしたTypeScriptの使用を推奨しています。TypeScriptと[`typescript-eslint`](https://typescript-eslint.io)をプロジェクトに統合する方法については、[TSテンプレート](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts)を参照してください。

## 性能改善とローカル検証（2026-10-08）

Node.js 22.12以降の22系を使用。

```sh
npm ci --ignore-scripts
npm run harness:preflight
npm run harness:check
```

`harness:check` はテスト・lint・ビルド・配布画像とPDF分割の検査を実行する。Node、開始時のHEAD、ソースのSHA-256、所要時間、成否を `.codex-temp/harness/latest.json` に記録し、検証中にソースが変われば失敗する。結果の再利用による検査省略はしない。開発ポートは5173（PORT指定可）に固定し、使用中なら停止する。

一覧・グリッドの行、検索結果、描画用データとコールバックを再利用し、採用枚数の参照にMapを使う。レイアウト・カードID・出力操作は維持。jsPDFはPDF操作時に読み込み、配布検査で初期読み込みに混入していないことを確認する。

本番用PNGは画素・寸法を照合した可逆WebPを生成し、小さくなる画像だけ画面の参照先を切り替える。657画像の画面向け合計は948,596,039バイトから573,874,606バイトへ39.5%削減。元PNGと既存の直接画像URLは従来どおり保持するため、dist全体の容量削減値ではない。変換キャッシュは.codex-temp/image-cache/で内容ハッシュを照合する。

npm testは既存の保存デッキ検索・ソートと画像URL互換を検証する。lintは既存警告8件（エラー0）を残しており、依頼外の挙動変更による警告解消は行っていない。

Chromiumの独立プロファイルで1280px／390pxの検索・枚数変更時の画像DOM維持・ゲストの保存と再読込・JSON／PNG／PDFダウンロード・PDF遅延読込を確認。外部リクエストはスタブ化したため、認証・クラウド保存・公式データの実接続やAndroid実機を確認したものではない。一時ブラウザ検証スクリプト・結果は作業用フォルダに保存し、配布物には含めない。

## 認証情報の混入防止

初回 clone 後は `npm run security:install` を実行してください。検査と検出時の対応は [SECURITY.md](SECURITY.md) を参照してください。
