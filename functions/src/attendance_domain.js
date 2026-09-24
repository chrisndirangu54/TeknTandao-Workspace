export function validLocation(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid location');
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('Invalid location');
  }
  return {latitude: Math.round(latitude * 1e6) / 1e6, longitude: Math.round(longitude * 1e6) / 1e6};
}

export function dayKey(now) {
  const parsed = new Date(now);
  if (!Number.isFinite(parsed.getTime())) throw new Error('Invalid time');
  return parsed.toISOString().slice(0, 10);
}

export function nextPunch(existing, at, location) {
  if (!existing) return {checkIn: at, checkInLocation: location};
  if (!existing.checkOut) return {checkOut: at, checkOutLocation: location};
  throw new Error('You have already checked out today');
}

export function monthBounds(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Month must be YYYY-MM');
  const [year, monthNumber] = month.split('-').map(Number);
  const endMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  const endYear = monthNumber === 12 ? year + 1 : year;
  return {start: month, end: `${endYear}-${String(endMonth).padStart(2, '0')}`};
}
