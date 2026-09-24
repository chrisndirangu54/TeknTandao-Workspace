import {money} from './domain.js';

// Published Kenya payroll arithmetic for February 2026 onward.
// NSSF lower limit KES 9,000, upper limit KES 108,000, 6% employee and employer.
// SHIF 2.75% of gross, minimum KES 300. Housing levy 1.5% employee and employer.
// PAYE bands and KES 2,400 monthly personal relief. NSSF, SHIF and housing levy
// reduce taxable pay. Amounts are rounded to the nearest shilling.
// This calculates a payslip. It does not file a KRA return.
export const kenya2026 = Object.freeze({
  id: 'KE-2026-02',
  nssfLower: 9000,
  nssfUpper: 108000,
  nssfRate: 0.06,
  shifRate: 0.0275,
  shifMinimum: 300,
  housingRate: 0.015,
  personalRelief: 2400,
  bands: Object.freeze([[24000, 0.1], [8333, 0.25], [467667, 0.3], [300000, 0.325], [Number.POSITIVE_INFINITY, 0.35]]),
});

const toMinor = shillings => shillings * 100;

export function statutoryPayroll(grossMinor, rates = kenya2026) {
  money(grossMinor);
  if (grossMinor <= 0 || grossMinor % 100 !== 0) throw new Error('Gross pay must be positive whole shillings');
  const gross = grossMinor / 100;
  const tier1 = Math.min(gross, rates.nssfLower);
  const tier2 = Math.max(0, Math.min(gross, rates.nssfUpper) - rates.nssfLower);
  const nssf = Math.round(tier1 * rates.nssfRate) + Math.round(tier2 * rates.nssfRate);
  const shif = Math.max(rates.shifMinimum, Math.round(gross * rates.shifRate));
  const housing = Math.round(gross * rates.housingRate);
  const taxable = Math.max(0, gross - nssf - shif - housing);
  let remaining = taxable;
  let tax = 0;
  for (const [width, rate] of rates.bands) {
    const slice = Math.min(remaining, width);
    tax += slice * rate;
    remaining -= slice;
    if (remaining <= 0) break;
  }
  const paye = Math.max(0, Math.round(tax) - rates.personalRelief);
  const net = gross - nssf - shif - housing - paye;
  if (!Number.isSafeInteger(net) || net < 0) throw new Error('Deductions exceed gross pay');
  return {
    rateCard: rates.id,
    grossMinor: toMinor(gross),
    nssfEmployeeMinor: toMinor(nssf),
    nssfEmployerMinor: toMinor(nssf),
    shifMinor: toMinor(shif),
    housingEmployeeMinor: toMinor(housing),
    housingEmployerMinor: toMinor(housing),
    taxableMinor: toMinor(taxable),
    payeMinor: toMinor(paye),
    netMinor: toMinor(net),
    employerCostMinor: toMinor(gross + nssf + housing),
  };
}
