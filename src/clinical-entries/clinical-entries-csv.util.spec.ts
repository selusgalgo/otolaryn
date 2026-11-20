import {
  parseClinicalEntriesFile,
  suggestClinicalEntryMapping,
} from './clinical-entries-csv.util';

const CIRUGIA_CSV = [
  'Fecha,Nº de historia,Enfermedad actual,Evolución,Diagnóstico,Informe,Doctor que lo envía,Exploración,Doctor',
  '01/03/2024,NH-1,Hernia inguinal,Buena,Hernia inguinal derecha,"Linea 1\nLinea 2",Dra. Pérez,No debe importarse,Dr. Federico',
].join('\n');

describe('clinical-entries-csv.util — plantillas', () => {
  it('sugiere los campos de la plantilla de cirugía con sus etiquetas', () => {
    const headers = CIRUGIA_CSV.split('\n')[0].split(',');
    const mapping = suggestClinicalEntryMapping(headers, 'cirugia');
    expect(mapping).toMatchObject({
      chiefComplaint: 'Enfermedad actual',
      evolution: 'Evolución',
      diagnosis: 'Diagnóstico',
      report: 'Informe',
      referringDoctor: 'Doctor que lo envía',
      doctorName: 'Doctor',
    });
    // Exploración no está en la plantilla de cirugía.
    expect(mapping.examinationFindings).toBeUndefined();
  });

  it('en ORL no sugiere los campos de cirugía, pero "Motivo" sigue valiendo', () => {
    const mapping = suggestClinicalEntryMapping(
      ['Motivo', 'Exploración', 'Informe', 'Evolución'],
      'orl',
    );
    expect(mapping).toEqual({
      chiefComplaint: 'Motivo',
      examinationFindings: 'Exploración',
    });
  });

  it('reconoce "Motivo" como Enfermedad actual en cirugía', () => {
    expect(suggestClinicalEntryMapping(['Motivo'], 'cirugia')).toEqual({
      chiefComplaint: 'Motivo',
    });
  });

  it('solo copia los campos de la plantilla aunque vengan mapeados otros', () => {
    const { rows, missingColumns } = parseClinicalEntriesFile(
      Buffer.from(CIRUGIA_CSV, 'utf-8'),
      'consultas.csv',
      {
        chiefComplaint: 'Enfermedad actual',
        evolution: 'Evolución',
        diagnosis: 'Diagnóstico',
        report: 'Informe',
        referringDoctor: 'Doctor que lo envía',
        examinationFindings: 'Exploración',
        patientLegacyId: 'Nº de historia',
      },
      'cirugia',
    );
    expect(missingColumns).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      chiefComplaint: 'Hernia inguinal',
      evolution: 'Buena',
      diagnosis: 'Hernia inguinal derecha',
      report: 'Linea 1\nLinea 2',
      referringDoctor: 'Dra. Pérez',
      patientLegacyId: 'NH-1',
    });
    expect(rows[0].examinationFindings).toBeUndefined();
  });

  it('pide "Enfermedad actual" como columna obligatoria en cirugía', () => {
    const { missingColumns } = parseClinicalEntriesFile(
      Buffer.from('Informe\nalgo', 'utf-8'),
      'consultas.csv',
      { report: 'Informe' },
      'cirugia',
    );
    expect(missingColumns).toEqual(['Enfermedad actual']);
  });
});
