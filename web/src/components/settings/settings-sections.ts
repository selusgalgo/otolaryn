import {
  BuildingOffice2Icon,
  CalendarDaysIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  LockClosedIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";

// Single list behind both the Configuración side menu (SettingsNav) and
// each block on the page (SettingsSection), so a title or description is
// only ever spelled out once. `id` is the block's anchor on /settings —
// every block is on one scrolling page, each with its own save, and the
// menu jumps between them.
export const SETTINGS_SECTIONS: {
  id: string;
  title: string;
  description: string;
  icon: typeof ClockIcon;
}[] = [
  {
    id: "clinic-profile",
    title: "Perfil de la clínica",
    description: "Nombre, dirección, teléfono y logotipo que aparecen en los PDF exportados.",
    icon: BuildingOffice2Icon,
  },
  {
    id: "schedule",
    title: "Horario de la clínica",
    description: "Días y tramos horarios en los que la clínica atiende citas.",
    icon: ClockIcon,
  },
  {
    id: "appointments",
    title: "Citas",
    description: "Duración con la que se precarga una cita nueva.",
    icon: CalendarDaysIcon,
  },
  {
    id: "antecedentes",
    title: "Antecedentes",
    description: "Etiquetas que los profesionales pueden marcar en la ficha de cada paciente.",
    icon: ClipboardDocumentListIcon,
  },
  {
    id: "insurance",
    title: "Compañías de seguros",
    description: "Aseguradoras con las que trabaja la clínica.",
    icon: ShieldCheckIcon,
  },
  {
    id: "security",
    title: "Seguridad",
    description: "Restringir el acceso de los profesionales a ordenadores autorizados.",
    icon: LockClosedIcon,
  },
];
