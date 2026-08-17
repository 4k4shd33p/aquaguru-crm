import { ArrowRight, LockKeyhole } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { useAuth } from '../features/auth/AuthProvider'
import { getAuthErrorMessage } from '../utils/errors'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { signIn, isConfigured } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    const { error: authError } = await signIn(email.trim(), password)
    setIsSubmitting(false)
    if (authError) { setError(getAuthErrorMessage(authError)); return }
    navigate('/dashboard', { replace: true })
  }

  return <div className="login-card"><span className="login-icon"><LockKeyhole size={21} /></span><span className="eyebrow">Secure sign in</span><h1>Welcome back</h1><p className="login-card__intro">Sign in to access your Aquaguru CRM workspace.</p>
    {!isConfigured && <div className="form-message form-message--warning" role="status">Supabase is not configured. Add the variables in <code>.env</code> from <code>.env.example</code>, then restart the app.</div>}
    <form onSubmit={handleSubmit} noValidate><label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="you@aquaguru.in" /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required placeholder="Enter your password" /></label>{error && <div className="form-message" role="alert">{error}</div>}<Button type="submit" disabled={isSubmitting || !isConfigured}>{isSubmitting ? 'Signing in…' : <>Sign in <ArrowRight size={17} /></>}</Button></form><p className="login-card__help">Need access? Contact your Aquaguru administrator.</p>
  </div>
}
