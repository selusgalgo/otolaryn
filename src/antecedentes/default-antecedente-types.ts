import { AntecedenteCategory } from './entities/antecedente-type.entity';

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

// A starter catalog for the familiar side — brand new with
// AntecedenteTypeCategory1735200000000 (the legacy app never tracked family
// history at all), editable afterwards from Configuración the same as
// every personal antecedente already is.
export const DEFAULT_ANTECEDENTE_FAMILIAR_TYPE_NAMES = [
  'Hipoacusia/sordera familiar',
  'Alergias familiares',
  'Diabetes familiar',
  'Enfermedades cardiovasculares familiares',
  'Asma familiar',
  'Cáncer familiar',
  'Otras',
];

// Used by PlatformService.createTenant() so a brand-new clinic starts out
// with both checklists populated, instead of empty until someone visits
// Configuración.
export function defaultAntecedenteTypeRows(tenantId: string) {
  const byCategory: [string[], AntecedenteCategory][] = [
    [DEFAULT_ANTECEDENTE_TYPE_NAMES, 'personal'],
    [DEFAULT_ANTECEDENTE_FAMILIAR_TYPE_NAMES, 'familiar'],
  ];
  return byCategory.flatMap(([names, category]) =>
    names.map((name, index) => ({
      tenantId,
      name,
      category,
      displayOrder: index,
    })),
  );
}
