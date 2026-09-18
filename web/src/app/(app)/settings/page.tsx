import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ChevronRightIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";

// Cada sección vive en su propia página en vez de aparecer las tres
// expandidas de golpe aquí — Horario (7 días x tramos) y Antecedentes (13
// filas) por sí solos ya hacían de esto una página larguísima. Este índice
// es solo enlaces; nada que fetchear todavía.
const SECTIONS: {
  href: string;
  title: string;
  description: string;
  icon: typeof ClockIcon;
}[] = [
  {
    href: "/settings/schedule",
    title: "Horario de la clínica",
    description: "Días y tramos horarios en los que la clínica atiende citas.",
    icon: ClockIcon,
  },
  {
    href: "/settings/antecedentes",
    title: "Antecedentes",
    description: "Etiquetas que los profesionales pueden marcar en la ficha de cada paciente.",
    icon: ClipboardDocumentListIcon,
  },
  {
    href: "/settings/insurance",
    title: "Compañías de seguros",
    description: "Aseguradoras con las que trabaja la clínica.",
    icon: ShieldCheckIcon,
  },
];

export default async function SettingsPage() {
  const me = await getCurrentUser();
  // Not in the sidebar for anyone else, but guard the route itself too —
  // each section page 403s at the backend anyway for a non-admin, this
  // just avoids landing on a broken page first.
  if (me.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Configuración</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} className="block">
            <Card className="h-full transition-colors hover:bg-accent/50">
              <CardContent className="flex items-start gap-3">
                <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <div className="flex-1 space-y-1">
                  <div className="font-medium">{title}</div>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
                <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
