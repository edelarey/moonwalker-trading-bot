/** Display calendar dates as dd-mm-YYYY. Wire format stays YYYY-MM-DD. */

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function validYmd(year: number, month: number, day: number): boolean {
  if (year < 1970 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false
  const dt = new Date(Date.UTC(year, month - 1, day))
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day
}

/** Parse ISO (YYYY-MM-DD) or day-first (dd-mm-YYYY / dd/mm/YYYY) to ISO, or ''. */
export function parseToIso(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s)
  let year: number
  let month: number
  let day: number
  if (iso) {
    year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3])
  } else if (dmy) {
    day = Number(dmy[1]); month = Number(dmy[2]); year = Number(dmy[3])
  } else {
    return ''
  }
  if (!validYmd(year, month, day)) return ''
  return `${year}-${pad2(month)}-${pad2(day)}`
}

export function isoToDmy(raw: string | null | undefined): string {
  const iso = parseToIso(raw)
  if (!iso) return ''
  const [year, month, day] = iso.split('-')
  return `${day}-${month}-${year}`
}

export function formatDateRange(start?: string | null, end?: string | null): string {
  const a = start ? (isoToDmy(start) || start) : '—'
  const b = end ? (isoToDmy(end) || end) : '—'
  return `${a} → ${b}`
}

export function formatDay(ms: number): string {
  const d = new Date(ms)
  if (!Number.isFinite(d.getTime())) return '—'
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`
}

export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
