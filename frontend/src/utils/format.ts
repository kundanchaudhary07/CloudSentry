export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return '—'
  const options: Intl.DateTimeFormatOptions = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? { dateStyle: 'medium' }
    : { dateStyle: 'medium', timeStyle: 'short' }
  return new Intl.DateTimeFormat(undefined, options).format(date)
}

export function formatAmount(value: string | null | undefined, currency: string | null): string {
  if (value === null || value === undefined || !currency) return 'Unavailable'
  const parsedAmount = Number(value)
  const amount = Math.abs(parsedAmount) < 0.005 ? 0 : parsedAmount
  if (!Number.isFinite(amount)) return 'Unavailable'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString()}`
  }
}
