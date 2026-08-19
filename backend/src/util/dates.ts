/** Calendar dates: accept YYYY-MM-DD or dd-mm-YYYY / dd/mm/YYYY; store ISO. */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function validYmd(year: number, month: number, day: number): boolean {
  if (year < 1970 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

export function toIsoDate(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  let year: number;
  let month: number;
  let day: number;
  if (iso) {
    year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]);
  } else if (dmy) {
    day = Number(dmy[1]); month = Number(dmy[2]); year = Number(dmy[3]);
  } else {
    return s;
  }
  if (!validYmd(year, month, day)) return s;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function dayStartUtcMs(raw: unknown): number {
  return new Date(toIsoDate(raw) + 'T00:00:00Z').getTime();
}
