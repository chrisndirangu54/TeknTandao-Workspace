import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareModuleRecord} from '../src/module_records.js';

test('clinical records require a patient reference and preserve instructions', () => {
  const result = prepareModuleRecord('hospital', 'prescription', {
    name: 'Prescription', patientId: 'patient_1', medicine: 'Medicine', instructions: 'As directed',
  });
  assert.deepEqual(result.reference, ['patientId', 'patients']);
  assert.equal(result.record.instructions, 'As directed');
  assert.throws(() => prepareModuleRecord('hospital', 'prescription', {
    name: 'Prescription', patientId: '../other', medicine: 'Medicine', instructions: 'As directed',
  }), /Invalid identifier/);
});
test('clinical mutations cannot smuggle payment or audit fields', () => {
  for (const field of ['paid', 'orgId', 'updatedBy', 'total', '__proto__']) {
    assert.throws(() => prepareModuleRecord('hospital', 'clinicalNote', {
      name: 'Consultation', patientId: 'p1', notes: 'Note', [field]: 'forged',
    }), /Unsupported record field/);
  }
});
test('unknown modules, prototype keys, missing fields and ambiguous times are rejected', () => {
  assert.throws(() => prepareModuleRecord('__proto__', 'appointment', {}));
  assert.throws(() => prepareModuleRecord('hospital', 'constructor', {}));
  assert.throws(() => prepareModuleRecord('school', 'grade', {name: 'Exam'}), /Missing/);
  assert.throws(() => prepareModuleRecord('hospital', 'appointment', {
    name: 'Visit', patientId: 'p1', doctor: 'Doctor', scheduledAt: '2026-09-22',
  }), /timezone/);
});
test('school grades reference shared students and appointments accept explicit timezone', () => {
  assert.deepEqual(prepareModuleRecord('school', 'grade', {
    name: 'Exam', studentId: 's1', subject: 'Math', result: '82/100',
  }).reference, ['studentId', 'students']);
  assert.equal(prepareModuleRecord('hospital', 'appointment', {
    name: 'Visit', patientId: 'p1', doctor: 'Doctor', scheduledAt: '2026-09-22T10:00:00+03:00',
  }).record.kind, 'appointment');
});

test('donor workflow validation rejects invented stages and reversed calendar intervals', () => {
  assert.throws(() => prepareModuleRecord('crm', 'deal', {name: 'Deal', contactId: 'c1', valueMinor: '10.50', stage: 'won'}));
  assert.throws(() => prepareModuleRecord('crm', 'deal', {name: 'Deal', contactId: 'c1', valueMinor: '1050', stage: 'imaginary'}));
  assert.equal(prepareModuleRecord('crm', 'deal', {name: 'Deal', contactId: 'c1', valueMinor: '1050', stage: 'won'}).record.valueMinor, 1050);
  assert.throws(() => prepareModuleRecord('crm', 'calendar', {name: 'Meeting', startAt: '2030-01-02T10:00:00Z', endAt: '2030-01-01T10:00:00Z'}));
  assert.equal(prepareModuleRecord('hospital', 'clinicalNote', {name: 'Note', patientId: 'p1', notes: 'Internal'}).record.patientVisible, false);
});

test('property favorites point at a property in the same organization', () => {
  const favorite = prepareModuleRecord('property', 'favorite', {name: 'Saved listing', propertyId: 'prop_1', notes: ''});
  assert.deepEqual(favorite.reference, ['propertyId', 'properties']);
  assert.throws(() => prepareModuleRecord('property', 'favorite', {name: 'Saved listing', propertyId: '../other', notes: ''}), /Invalid identifier/);
});

test('payroll runs record gross pay only and reject statutory or malformed periods', () => {
  const run = prepareModuleRecord('hr', 'payRun', {
    name: 'September', employeeId: 'emp_1', period: '2026-09', grossMinor: '25000000', status: 'draft', notes: '',
  });
  assert.equal(run.record.grossMinor, 25000000);
  assert.deepEqual(run.reference, ['employeeId', 'employees']);
  assert.equal(run.record.notes, '');
  assert.throws(() => prepareModuleRecord('hr', 'payRun', {
    name: 'September', employeeId: 'emp_1', period: '2026-13', grossMinor: '1', status: 'draft',
  }), /YYYY-MM/);
  assert.throws(() => prepareModuleRecord('hr', 'payRun', {
    name: 'September', employeeId: 'emp_1', period: '2026-09', grossMinor: '1', status: 'draft', paye: '1',
  }), /Unsupported record field/);
});
