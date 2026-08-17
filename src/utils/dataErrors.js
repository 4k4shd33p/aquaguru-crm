export function getDataErrorMessage(error, fallback) {
  if (!error) return fallback
  if (error.code === '23505') return 'A record with that value already exists. Please review and try again.'
  if (error.code === '23503') return 'This record is linked to information that is no longer available. Refresh and try again.'
  return fallback
}
