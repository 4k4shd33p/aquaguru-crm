import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!supabase) { setIsLoading(false); return undefined }

    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) { setSession(data.session); setIsLoading(false) }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsLoading(false)
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    isLoading,
    isConfigured: isSupabaseConfigured,
    signIn: async (email, password) => {
      if (!supabase) return { error: new Error('Supabase is not configured. Add the environment variables and restart the app.') }
      return supabase.auth.signInWithPassword({ email, password })
    },
    signOut: async () => {
      if (!supabase) return { error: null }
      return supabase.auth.signOut()
    },
  }), [isLoading, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
