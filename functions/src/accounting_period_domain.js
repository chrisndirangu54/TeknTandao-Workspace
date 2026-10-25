export function accountingPeriod(date) {
  if (typeof date !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(date)) throw new Error('Invalid accounting date');
  const parsed = new Date(date+'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date) throw new Error('Invalid accounting date');
  return date.slice(0,7);
}
export function assertOpenPeriod(period, state) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('Invalid period');
  if (state?.status === 'closed') throw new Error('Accounting period is closed');
  if (state?.status && state.status !== 'open') throw new Error('Unknown accounting period state');
  return period;
}
