import {identifier, textValue, money} from './domain.js';

export function hospitalBooking(input, service, now = Date.now()) {
  if (!['appointment', 'labTest'].includes(input.kind)) throw new Error('Invalid booking kind');
  const scheduledAt = textValue(input.scheduledAt, 80);
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(scheduledAt) || !Number.isFinite(Date.parse(scheduledAt)) || Date.parse(scheduledAt) <= now) {
    throw new Error('Choose a future date with a timezone');
  }
  if (!service || service.active !== true || service.kind !== input.kind) throw new Error('Service unavailable');
  const priceMinor = money(service.priceMinor);
  return {kind: input.kind, serviceId: identifier(input.serviceId), name: textValue(service.name),
    scheduledAt: new Date(scheduledAt).toISOString(), priceMinor, currency: 'KES', status: 'requested'};
}

export function patientRecord(id, data) {
  if (data.kind === 'clinicalNote' && data.patientVisible !== true) return null;
  if (data.kind === 'labReport' && data.status !== 'ready') return null;
  const result = {id};
  for (const key of ['kind', 'name', 'scheduledAt', 'status', 'doctor', 'medicine', 'instructions', 'priceMinor', 'currency', 'received', 'invoiceId']) {
    if (data[key] !== undefined) result[key] = data[key];
  }
  if (data.kind === 'clinicalNote') result.notes = data.notes || '';
  return result;
}

export function assertHospitalPayment(payment, verified) {
  if (verified.status !== 'success' || verified.reference !== payment.reference ||
      verified.amount !== payment.total || verified.currency !== payment.currency) throw new Error('Payment mismatch');
}
