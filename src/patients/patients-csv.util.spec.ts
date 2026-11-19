import { cellToDate } from '../shared/spreadsheet-import.util';
import type { Patient } from './entities/patient.entity';
import {
  buildPatientsExport,
  parseGender,
  parsePatientsFile,
  parsePatientsUpdateFile,
  splitPhone,
  suggestMapping,
  suggestUpdateMapping,
} from './patients-csv.util';

describe('parseGender', () => {
  it.each([
    ['H', 'hombre'],
    ['hombre', 'hombre'],
    ['V', 'hombre'],
    ['Varón', 'hombre'],
    ['MASCULINO', 'hombre'],
    ['M', 'mujer'],
    ['Mujer', 'mujer'],
    ['f', 'mujer'],
    ['Femenino', 'mujer'],
    [' m. ', 'mujer'],
  ])('reads %j as %s', (input, expected) => {
    expect(parseGender(input)).toBe(expected);
  });

  it.each(['', 'X', 'otro', '1'])('leaves %j unset', (input) => {
    expect(parseGender(input)).toBeUndefined();
  });
});

describe('gender and insurance number columns', () => {
  it('suggests SEXO / PÓLIZA headers from other systems', () => {
    expect(suggestMapping(['NOMBRE', 'SEXO', 'PÓLIZA'])).toMatchObject({
      gender: 'SEXO',
      insuranceNumber: 'PÓLIZA',
    });
  });

  it('round-trips through export and import', () => {
    const patient = {
      firstName: 'Ana',
      lastName: 'López',
      gender: 'mujer',
      insuranceNumber: 'ASI-0012345',
    } as Patient;
    const { buffer } = buildPatientsExport([patient], 'csv');

    const csv = buffer.toString('utf-8');
    expect(csv).toContain('Género');
    expect(csv).toContain('Mujer');

    const { rows } = parsePatientsFile(buffer, 'pacientes.csv');
    expect(rows[0]).toMatchObject({
      gender: 'mujer',
      insuranceNumber: 'ASI-0012345',
    });
  });

  it('imports an unrecognized gender as empty instead of failing', () => {
    const csv = Buffer.from('Nombre,Apellidos,Sexo\nLuis,Pérez,?\n');
    const { rows } = parsePatientsFile(csv, 'p.csv');
    expect(rows[0].gender).toBeUndefined();
    expect(rows[0].firstName).toBe('Luis');
  });
});

describe('splitPhone', () => {
  it.each([
    ['645575702/955761278', '645575702', '955761278'],
    ['954 25 19 95 / 636 06 89 86', '954 25 19 95', '636 06 89 86'],
    ['645575702, 955761278', '645575702', '955761278'],
    ['645575702; 955761278', '645575702', '955761278'],
    ['645575702 y 955761278', '645575702', '955761278'],
    ['645575702\n955761278', '645575702', '955761278'],
    ['645575702 955761278', '645575702', '955761278'],
    ['954 25 19 95 636 06 89 86', '954251995', '636068986'],
  ])('splits %j into two numbers', (input, phone, phone2) => {
    expect(splitPhone(input)).toEqual({ phone, phone2 });
  });

  it.each(['645575702', '954 25 19 95', '955-76-12-78', '+34 645 57 57 02'])(
    'leaves the single number %j alone',
    (input) => {
      expect(splitPhone(input)).toEqual({ phone: input });
    },
  );

  it('leaves three numbers untouched', () => {
    expect(splitPhone('1/2/3')).toEqual({ phone: '1/2/3' });
  });
});

describe('cellToDate with unpadded day-first dates', () => {
  it('normalizes d/m/yyyy to ISO (displayed as DD/MM/AAAA)', () => {
    expect(cellToDate('27/9/1942')).toBe('1942-09-27');
    expect(cellToDate('1/2/1980')).toBe('1980-02-01');
  });
});

describe('update mode (parsePatientsUpdateFile)', () => {
  const csv = (text: string) => Buffer.from(text, 'utf-8');

  it('suggests the patient columns, aliases and aseguradora', () => {
    const mapping = suggestUpdateMapping([
      'Nº de historia',
      'Teléfono',
      'SEXO',
      'PÓLIZA',
      'Aseguradora',
      'Fecha de nacimiento',
    ]);
    expect(mapping).toMatchObject({
      legacyId: 'Nº de historia',
      phone: 'Teléfono',
      gender: 'SEXO',
      insuranceNumber: 'PÓLIZA',
      insuranceEntityName: 'Aseguradora',
      dateOfBirth: 'Fecha de nacimiento',
    });
  });

  it('keeps only non-empty cells, normalized (ISO date, gender, split phone)', () => {
    const { rows } = parsePatientsUpdateFile(
      csv(
        'Nº de historia,Teléfono,Email,Sexo,Fecha de nacimiento,Aseguradora\n' +
          '10,622222222/633333333,,V,02/03/1985,MAPFRE\n',
      ),
      'u.csv',
    );
    expect(rows[0]).toEqual({
      legacyId: '10',
      insuranceEntityName: 'MAPFRE',
      fields: {
        phone: '622222222',
        phone2: '633333333',
        gender: 'hombre',
        dateOfBirth: '1985-03-02',
      },
    });
  });

  it('an explicit Teléfono 2 column wins over the split of Teléfono', () => {
    const { rows } = parsePatientsUpdateFile(
      csv(
        'Nº de historia,Teléfono,Teléfono 2\n10,111111111/222222222,333333333\n',
      ),
      'u.csv',
    );
    expect(rows[0].fields).toEqual({ phone: '111111111', phone2: '333333333' });
  });

  it('an unrecognized gender is dropped instead of failing the row', () => {
    const { rows } = parsePatientsUpdateFile(
      csv('Nº de historia,Sexo\n10,?\n'),
      'u.csv',
    );
    expect(rows[0].fields).toBeUndefined();
  });
});
