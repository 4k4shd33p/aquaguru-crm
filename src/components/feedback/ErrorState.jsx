export function ErrorState({ title = 'Something went wrong', description = 'Please refresh and try again.' }) {
  return <div className="error-state" role="alert"><strong>{title}</strong><span>{description}</span></div>
}
