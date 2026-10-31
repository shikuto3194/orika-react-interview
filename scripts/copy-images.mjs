// ルートの images/ をビルド出力(dist/images/)へ丸ごとコピーする。
// images/ は public/ 配下ではないため Vite は自動コピーしない。
// build の後段(postbuild)で実行し、本番ビルドに画像を同梱する。
//
// dev では Vite がプロジェクトルートを配信するため /images/... はそのまま解決でき、
// このスクリプトは不要(build 専用)。

import { cp, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const srcDir = resolve(projectRoot, 'images');
const outDir = resolve(projectRoot, 'dist', 'images');

async function main() {
  try {
    await stat(srcDir);
  } catch {
    console.log('[copy-images] images/ が見つからないためスキップ');
    return;
  }

  await cp(srcDir, outDir, { recursive: true });
  console.log(`[copy-images] images/ -> ${outDir}`);
}

main().catch((err) => {
  console.error('[copy-images] failed:', err);
  process.exit(1);
});
