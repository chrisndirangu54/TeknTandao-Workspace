import {identifier, optionalText} from './domain.js';

// These operational records deliberately exclude payments and settlement state.
// Financial mutations must continue through the dedicated accounting workflows.
export const moduleRecordSchemas = Object.freeze({
  crm: {
    deal: {fields: ['name', 'contactId', 'valueMinor', 'stage'], reference: ['contactId', 'contacts']},
    task: {fields: ['name', 'dueAt', 'status', 'notes']},
    calendar: {fields: ['name', 'startAt', 'endAt', 'notes']},
  },
  hr: {
    application: {fields: ['name', 'email', 'position', 'stage', 'notes']},
    leave: {fields: ['name', 'employeeId', 'startAt', 'endAt', 'status', 'notes'], reference: ['employeeId', 'employees']},
    payRun: {fields: ['name', 'employeeId', 'period', 'grossMinor', 'status', 'notes'], reference: ['employeeId', 'employees']},
  },
  hospital: {
    appointment: {fields: ['name', 'patientId', 'doctor', 'scheduledAt', 'notes'], reference: ['patientId', 'patients']},
    prescription: {fields: ['name', 'patientId', 'medicine', 'instructions'], reference: ['patientId', 'patients']},
    labTest: {fields: ['name', 'patientId', 'scheduledAt', 'notes'], reference: ['patientId', 'patients']},
    clinicalNote: {fields: ['name', 'patientId', 'notes', 'patientVisible'], reference: ['patientId', 'patients']},
  },
  property: {
    favorite: {fields: ['name', 'propertyId', 'notes'], reference: ['propertyId', 'properties']},
  },
  school: {
    lesson: {fields: ['name', 'subject', 'className', 'notes']},
    assignment: {fields: ['name', 'subject', 'className', 'dueAt', 'notes']},
    announcement: {fields: ['name', 'className', 'notes']},
    grade: {fields: ['name', 'studentId', 'subject', 'result'], reference: ['studentId', 'students']},
  },
});

export function prepareModuleRecord(appId, kind, input) {
  if (!Object.hasOwn(moduleRecordSchemas, appId) || !Object.hasOwn(moduleRecordSchemas[appId], kind)) {
    throw new Error('Unsupported module record type');
  }
  const schema = moduleRecordSchemas[appId][kind];
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid record');
  if (Object.keys(input).some(key => !schema.fields.includes(key))) throw new Error('Unsupported record field');
  const record = {kind};
  for (const field of schema.fields) {
    if (field === 'patientVisible') {
      const visible = input[field] ?? false;
      if (![true, false, 'true', 'false', ''].includes(visible)) throw new Error('Invalid patient visibility');
      record[field] = visible === true || visible === 'true';
      continue;
    }
    if (field === 'valueMinor' || field === 'grossMinor') {
      const amount = typeof input[field] === 'string' && /^\d+$/.test(input[field]) ? Number(input[field]) : input[field];
      if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1000000000) throw new Error('Invalid amount in minor units');
      record[field] = amount;
      continue;
    }
    const value = optionalText(input[field] ?? '', field === 'notes' || field === 'instructions' ? 4000 : 250);
    if (!value && field !== 'notes') throw new Error(`Missing ${field}`);
    if (field === 'period' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error('Period must be YYYY-MM');
    if (field.endsWith('At') && !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
      throw new Error(`${field} requires an ISO date and timezone`);
    }
    if (field.endsWith('At') && !Number.isFinite(Date.parse(value))) throw new Error(`Invalid ${field}`);
    record[field] = value;
  }
  if (schema.reference) identifier(record[schema.reference[0]]);
  if (record.startAt && record.endAt && Date.parse(record.endAt) <= Date.parse(record.startAt)) throw new Error('End must follow start');
  const stages = {deal: ['lead', 'qualified', 'proposal', 'won', 'lost'], application: ['applied', 'screening', 'interview', 'offered', 'hired', 'rejected']};
  if (Object.hasOwn(stages, kind) && !stages[kind].includes(record.stage)) throw new Error('Invalid workflow stage');
  const statuses = {task: ['open', 'in_progress', 'completed', 'cancelled'], leave: ['requested', 'approved', 'rejected', 'cancelled'], payRun: ['draft', 'approved', 'paid', 'void']};
  if (Object.hasOwn(statuses, kind) && !statuses[kind].includes(record.status)) throw new Error('Invalid workflow status');
  return {record, reference: schema.reference};
}
