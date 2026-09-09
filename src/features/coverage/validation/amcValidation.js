const formatDate = (value) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`))

export function validateAmc(values) {
  const errors = {}
  if (!values.equipmentId) errors.equipmentId = 'Select equipment.'
  if (!values.startDate) errors.startDate = 'Start date is required.'
  if (!values.endDate) errors.endDate = 'End date is required.'
  if (values.startDate && values.endDate && values.endDate < values.startDate) errors.endDate = 'End date must be on or after the start date.'
  if (values.startDate && values.initialInstallationDate && values.startDate < values.initialInstallationDate) errors.startDate = `AMC cannot start before this equipment's initial installation date (${formatDate(values.initialInstallationDate)}).`
  for (const key of ['standardPrice', 'agreedPrice', 'plannedVisits']) if (values[key] !== '' && values[key] !== null && Number(values[key]) < 0) errors[key] = key === 'plannedVisits' ? 'Planned visits cannot be negative.' : 'Prices cannot be negative.'
  return errors
}
