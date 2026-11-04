import { DOCTOR_COLOR_CLASSES } from "@/lib/roles";

const SIZE_CLASSES = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
};

// Pacientes (y cualquier persona que no sea médico) en azul de marca; los
// profesionales médicos en turquesa (los colores de la etiqueta del rol
// Profesional, ver DOCTOR_COLOR_CLASSES), para distinguirlos de un vistazo en listas
// donde salen juntos. El color no es lo único que los separa: sus nombres
// llevan además "Dr."/"Dra." delante.
const VARIANT_CLASSES = {
  patient: "bg-primary-tint text-primary",
  doctor: DOCTOR_COLOR_CLASSES,
};

interface InitialsAvatarProps {
  firstName: string;
  lastName: string;
  size?: keyof typeof SIZE_CLASSES;
  variant?: keyof typeof VARIANT_CLASSES;
}

export function InitialsAvatar({ firstName, lastName, size = "md", variant = "patient" }: InitialsAvatarProps) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  return (
    <div
      aria-hidden="true"
      data-variant={variant}
      className={`flex shrink-0 select-none items-center justify-center rounded-full font-semibold ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]}`}
    >
      {initials}
    </div>
  );
}
