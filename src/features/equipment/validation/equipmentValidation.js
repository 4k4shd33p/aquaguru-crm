export function equipmentSaveMessage(error) {
  if (error?.code === '23503') return 'The selected customer, location, equipment type, or product model is no longer available. Refresh and try again.'
  if (error?.message?.toLowerCase().includes('location')) return 'Choose a location that belongs to the selected customer.'
  return 'Equipment could not be saved. Please review the details and try again.'
}

