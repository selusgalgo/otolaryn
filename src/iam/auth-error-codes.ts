// Códigos estables que acompañan a cada 401 (campo `code` del cuerpo) para
// que el frontend distinga "la sesión terminó" de "este dispositivo no está
// autorizado" o "la cuenta está desactivada" sin tener que adivinarlo por el
// texto del mensaje. El `message` de cada 401 no cambia.
export const AuthErrorCode = {
  // JWT caducado o ausente (la cookie de sesión también caduca a la hora).
  SessionExpired: 'SESSION_EXPIRED',
  // JWT manipulado, firmado con otro secreto, malformado...
  TokenInvalid: 'TOKEN_INVALID',
  DeviceLocked: 'DEVICE_LOCKED',
  AccountDisabled: 'ACCOUNT_DISABLED',
} as const;

export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];
