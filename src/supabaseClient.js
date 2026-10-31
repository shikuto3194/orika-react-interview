import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY が必要です');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// このアプリ (BS 版オリカツール) は ACG マネージャーと同じ Supabase プロジェクトを共有しているため、
// decks テーブルの行を game 列で分離する。'bs' 側からのクエリは game='bs' に限定して読む。
export const APP_GAME_ID = 'bs';
