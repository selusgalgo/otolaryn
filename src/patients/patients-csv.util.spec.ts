import { cellToDate } from '../shared/spreadsheet-import.util';
import { splitPhone } from './patients-csv.util';

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
