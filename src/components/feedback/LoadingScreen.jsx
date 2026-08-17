export function LoadingScreen({ label = 'Loading Aquaguru CRM' }) {
  return <main className="loading-screen" aria-live="polite"><span className="spinner" aria-hidden="true" />{label}</main>
}
