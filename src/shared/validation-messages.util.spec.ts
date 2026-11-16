import {
  spanishMessage,
  translateValidationMessages,
} from './validation-messages.util';

describe('translateValidationMessages', () => {
  it("translates class-validator's English templates", () => {
    expect(translateValidationMessages(['name should not be empty'])).toEqual([
      'name no puede estar vacío',
    ]);
  });

  it('passes registered Spanish messages through untouched', () => {
    const message = spanishMessage('El IBAN no es válido');
    expect(translateValidationMessages([message])).toEqual([message]);
  });

  it('falls back to a generic message for unknown, unregistered text', () => {
    expect(translateValidationMessages(['something custom'])).toEqual([
      'Hay un dato con un formato no válido',
    ]);
  });

  it('removes duplicates', () => {
    const message = spanishMessage('La cuota no es válida');
    expect(translateValidationMessages([message, message])).toEqual([message]);
  });
});
