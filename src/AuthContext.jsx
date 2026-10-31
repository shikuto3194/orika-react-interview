import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// --- 認証コンテキスト ---
// アプリ全体で「今ログインしているユーザー」を共有するための仕組み
const AuthContext = createContext(null);

/**
 * AuthProvider: アプリ全体をこれで囲むと、
 * どのコンポーネントからでも useAuth() でユーザー情報を取得できる
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);       // ログイン中のユーザー情報
  const [loading, setLoading] = useState(true);  // 初期読み込み中かどうか

  useEffect(() => {
    // ページを開いた時に、既にログイン済みかチェック
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // ログイン/ログアウト時に自動で更新される仕組み
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    // クリーンアップ（コンポーネントが消える時に購読解除）
    return () => subscription.unsubscribe();
  }, []);

  // メールでログイン
  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  };

  // ログアウト
  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * useAuth(): どのコンポーネントからでも呼べる
 * 
 * 使い方:
 *   const { user, signIn, signOut } = useAuth();
 *   if (user) { ... ログイン済み ... }
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth は AuthProvider の中で使ってください');
  }
  return context;
}
