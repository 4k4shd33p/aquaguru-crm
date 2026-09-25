export function equipmentSaveMessage(error) {
  const message = error?.message?.toLowerCase() || ''
  if (error?.code === '23503') return 'The selected customer, location, equipment type, or product model is no longer available. Refresh and try again.'
  if (message.includes('change the equipment customer')) return 'Change the equipment customer and location in separate updates.'
  if (message.includes('cannot be removed')) return 'A recorded equipment location cannot be removed. Select the correct location instead.'
  if (message.includes('already assigned')) return 'Equipment is already assigned to the selected location.'
  if (message.includes('location')) return 'Choose a location that belongs to the selected customer.'
  return 'Equipment could not be saved. Please review the details and try again.'
}
export function componentSaveMessage(error) {
  const message = error?.message?.toLowerCase() || ''
  if (error?.code === '23505' || message.includes('one_open_role')) return 'A current component is already recorded for this role. Replace it through a completed Service.'
  if (message.includes('component role must match') || message.includes('same component role')) return 'Choose a part that belongs to the same component role.'
  if (message.includes('equipment-tracked part')) return 'Choose an active tracked part with a component role.'
  if (message.includes('replacement components')) return 'A replacement component must be created by its completed Service.'
  if (message.includes('source service')) return 'This component came from a completed Service. Correct that source Service instead.'
  if (message.includes('chronology') || message.includes('later replacement') || message.includes('related history') || message.includes('before this component was removed')) return 'This correction would make component history ambiguous. Correct the relevant Service history instead.'
  if (message.includes('correction reason')) return 'Enter a clear correction reason.'
  return 'The component details could not be corrected. Please review the details and try again.'
}
