# 管理者のアカウント・デッキ連携

マイページ → 運営メニュー → アカウント・デッキ連携（/admin/accounts）。
acg-react の運営メニュー構成を採用し、既存イベント管理は /admin/events へ移動。

- メイン・サブは登録済みメールで指定。ログイン中の管理者をどちらかに含める。
- サブアカウント連携とデッキ連携（BS）が両方オンなら、サブの旧 BS デッキを削除しメインを共用する。
- オフはその時点の共有デッキをサブに複製して独立。オン以前のデッキは復元しない。
- 共有中のメインとサブの入れ替えでは、共有デッキを新メインへ移す。
- ログインと対戦参加者は別々。ACG デッキは対象外。
- ログイン中は端末キャッシュを自動アップロードしない。ゲストの端末保存とクラウド保存を分離する。

DB 正源は orica-simulator の supabase/migrations/20260917073409_bs_account_linking.sql。
両アプリ公開より先に適用する。初期設定はスイッチをオフにし、管理画面でオンにした時に切り替える。
公開 API は bs_admin_account_link と bs_deck_library。世代の不一致は保存を拒否する。

AccountLinkSettings.jsx と useDeckLibrary.js は orica-simulator の同名 TS/TSX から生成する。
更新は同リポジトリで node scripts/sync-orika-account-link.mjs <orika-react-root> を実行。
GUI/API 往復テストは同リポジトリの e2e/account-link.spec.ts。
ORIKA_TEST_URL に本アプリのローカル URL を指定して実行する。
