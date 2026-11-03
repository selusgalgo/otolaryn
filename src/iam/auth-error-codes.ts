// Códigos estables que acompañan a cada 401 (campo `code` del cuerpo) para
// que el frontend distinga "la sesión terminó" de "este dispositivo no está
// autorizado" o "la cuenta está desactivada" sin tener que adivinarlo por el
// texto del mensaje. El `message` de cada 401 no cambia.
export const AuthErrorCode = {
  // JWT caducado o ausente (la cookie de sesión también caduca a la hora).
  SessionExpired: 'SESSION_EXPIRED',
  // JWT manipulado, firmado con otro secreto, malformado...
  TokenInvalid: 'TOKEN_INVALID',
  // Este ordenador no tiene credencial de dispositivo instalada.
  DeviceLocked: 'DEVICE_LOCKED',
  // Sí la tiene, pero ya no vale: el administrador generó una nueva (o la
  // cookie está corrupta). Se distingue de DEVICE_LOCKED para poder decirle a
  // la persona qué hacer: pedir el enlace actualizado, no "contactar con el
  // administrador" sin más.
  DeviceCredentialInvalid: 'DEVICE_CREDENTIAL_INVALID',
  AccountDisabled: 'ACCOUNT_DISABLED',
} as const;

export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];
