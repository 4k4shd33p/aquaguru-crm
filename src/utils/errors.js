export function getAuthErrorMessage(error) {
  const message = error?.message?.toLowerCase() ?? ''
  if (message.includes('invalid login credentials')) return 'Your email or password is incorrect.'
  if (message.includes('email not confirmed')) return 'Please confirm your email before signing in.'
  if (message.includes('rate limit')) return 'Too many attempts. Please wait a moment and try again.'
  return error?.message || 'We could not sign you in. Please try again.'
}
