const dateTime = new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' })
const relative = new Intl.RelativeTimeFormat('zh-TW', { numeric: 'auto' })

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso))

export function formatRelative(iso: string, now = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [unit, sec] of units) if (Math.abs(diff) >= sec) return relative.format(Math.round(diff / sec), unit)
  return '剛剛'
}

export const formatNumber = (n: number) => new Intl.NumberFormat('zh-TW').format(n)
