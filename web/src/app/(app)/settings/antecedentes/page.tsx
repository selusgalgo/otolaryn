import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { AntecedenteCategoryCard } from "@/components/settings/antecedente-category-card";
import { AntecedenteTypesForm } from "@/components/settings/antecedente-types-form";
import { apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import type { AntecedenteType } from "@/lib/types";

export default async function AntecedentesSettingsPage() {
  const me = await getCurrentUser();
  if (me.role !== "admin") {
    redirect("/dashboard");
  }

  const antecedenteTypes = await apiFetch<AntecedenteType[]>("/antecedente-types");
  const personalTypes = antecedenteTypes.filter((t) => t.category === "personal");
  const familiarTypes = antecedenteTypes.filter((t) => t.category === "familiar");

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        >
          <ArrowLeftIcon className="size-4" />
          Volver a Configuración
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Antecedentes</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <AntecedenteCategoryCard title="Antecedentes personales">
          <AntecedenteTypesForm category="personal" initialTypes={personalTypes} />
        </AntecedenteCategoryCard>

        <AntecedenteCategoryCard title="Antecedentes familiares">
          <AntecedenteTypesForm category="familiar" initialTypes={familiarTypes} />
        </AntecedenteCategoryCard>
      </div>
    </div>
  );
}
