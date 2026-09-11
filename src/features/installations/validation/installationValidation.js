export function validateInstallation(values) {
  const errors = {}
  if (!values.equipmentId) errors.equipmentId = 'Select equipment before continuing.'
  if (!values.classification) errors.classification = 'Select an installation classification.'
  return errors
}

export function validateCompletion(values) {
  const errors = {}
  if (!values.installationDate) errors.installationDate = 'Enter the actual installation date.'
  for (const key of ['tdsIn', 'tdsOut', 'installationCharge', 'technicianCharge', 'travelCost', 'otherDirectCost']) {
    if (values[key] !== '' && values[key] !== null && values[key] !== undefined && Number(values[key]) < 0) {
      errors[key] = 'TDS and charges cannot be negative.'
    }
  }
  if (values.otherDirectCost !== '' && values.otherDirectCost !== null && values.otherDirectCost !== undefined
    && Number(values.otherDirectCost) > 0 && !String(values.otherDirectCostNote ?? '').trim()) {
    errors.otherDirectCostNote = 'Enter a note when Other Direct Cost is greater than zero.'
  }
  return errors
}
