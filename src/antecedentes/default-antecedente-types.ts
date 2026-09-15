// The 13 antecedentes the legacy OTOLARYN desktop app always tracked (its
// own fixed columns: TABACO, ALCOHOL...) — every brand-new tenant gets
// these seeded automatically, same rationale as
// PlatformService.createTenant seeding a default ClinicHour schedule:
// without it, a fresh clinic would show up with an empty antecedentes
// checklist until someone visits Configuración and adds them one by one.
// Order matches the historical migration
// (1733900000000-PatientAntecedentes) that backfilled these onto every
// tenant that already existed at the time.
export const DEFAULT_ANTECEDENTE_TYPE_NAMES = [
  'Tabaco',
  'Alcohol',
  'Diabetes',
  'HTA',
  'EPOC',
  'Glaucoma',
  'Gastralgias',
  'Alergias ambientales',
  'Alergias medicamentosas',
  'Cirugías',
  'Tumores',
  'Sordera',
  'Otras',
];

export function defaultAntecedenteTypeRows(tenantId: string) {
  return DEFAULT_ANTECEDENTE_TYPE_NAMES.map((name, index) => ({
    tenantId,
    name,
    displayOrder: index,
  }));
}
