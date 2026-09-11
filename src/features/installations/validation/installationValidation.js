const hasValue = (value) => value !== '' && value !== null && value !== undefined

export function validateInstallation(values) {
  const errors = {}
  if (!values.equipmentId) errors.equipmentId = 'Select equipment before continuing.'
  if (!values.classification) errors.classification = 'Select an installation classification.'
  return errors
}

export function validateWorkItems(items = []) {
  const errors = {}
  for (const [index, item] of items.entries()) {
    const label = `Additional Work item ${index + 1}`
    if (!String(item.description ?? '').trim()) return { workItems: `${label}: enter a description.` }
    if (!hasValue(item.quantity) || Number(item.quantity) <= 0) return { workItems: `${label}: quantity must be greater than zero.` }
    if (!['Paid', 'Included', 'Complimentary', 'Unknown'].includes(item.commercialTreatment)) return { workItems: `${label}: choose a commercial treatment.` }
    if (hasValue(item.customerCharge) && Number(item.customerCharge) < 0) return { workItems: `${label}: customer charge cannot be negative.` }
    if (hasValue(item.directCost) && Number(item.directCost) < 0) return { workItems: `${label}: direct cost cannot be negative.` }
    if (item.commercialTreatment === 'Paid' && (!hasValue(item.customerCharge) || Number(item.customerCharge) <= 0)) return { workItems: `${label}: Paid work needs a positive customer charge.` }
    if (['Included', 'Complimentary'].includes(item.commercialTreatment) && (!hasValue(item.customerCharge) || Number(item.customerCharge) !== 0)) return { workItems: `${label}: Included or Complimentary work must have a known customer charge of ₹0.` }
  }
  return errors
}

export function validateCompletion(values) {
  const errors = {}
  if (!values.installationDate) errors.installationDate = 'Enter the actual installation date.'
  for (const key of ['tdsIn', 'tdsOut', 'installationCharge', 'technicianCharge', 'travelCost', 'otherDirectCost']) {
    if (hasValue(values[key]) && Number(values[key]) < 0) errors[key] = 'TDS and charges cannot be negative.'
  }
  if (hasValue(values.otherDirectCost) && Number(values.otherDirectCost) > 0 && !String(values.otherDirectCostNote ?? '').trim()) {
    errors.otherDirectCostNote = 'Enter a note when Other Direct Cost is greater than zero.'
  }
  return { ...errors, ...validateWorkItems(values.workItems) }
}
