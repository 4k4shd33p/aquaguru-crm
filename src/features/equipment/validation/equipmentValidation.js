export function equipmentSaveMessage(error) {
  if (error?.code === '23503') return 'The selected customer, location, equipment type, or product model is no longer available. Refresh and try again.'
  if (error?.message?.toLowerCase().includes('location')) return 'Choose a location that belongs to the selected customer.'
  return 'Equipment could not be saved. Please review the details and try again.'
}

export function componentSaveMessage(error) {
  const message = error?.message?.toLowerCase() || ''
  if (error?.code === '23505' || message.includes('one_open_role')) return 'A current component is already recorded for this role. Replace it through a completed Service.'
  if (message.includes('component role must match')) return 'Choose a part that belongs to the selected component role.'
  if (message.includes('equipment-tracked part')) return 'Choose an active tracked part with a component role.'
  if (message.includes('replacement components')) return 'A replacement component must be created by its completed Service.'
  return 'The existing component could not be recorded. Please review the details and try again.'
}
