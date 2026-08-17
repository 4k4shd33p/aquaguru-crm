import { Droplets } from 'lucide-react'

export function AuthLayout({ children }) {
  return <main className="auth-layout"><section className="auth-panel"><div className="auth-brand"><span className="brand-mark"><Droplets size={24} fill="currentColor" /></span><span>Aquaguru<small>CRM</small></span></div>{children}</section><aside className="auth-aside"><div><span className="eyebrow">Service operations, simplified</span><h2>A clearer view of every customer relationship.</h2><p>One secure workspace for Aquaguru’s service teams.</p></div></aside></main>
}
