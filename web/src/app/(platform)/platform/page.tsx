import Link from "next/link";
import { SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateTenantDialog } from "@/components/platform/create-tenant-dialog";
import { apiFetch } from "@/lib/api";
import type { Tenant } from "@/lib/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { dateStyle: "medium" });
}

export default async function PlatformPage() {
  const tenants = await apiFetch<Tenant[]>("/platform/tenants");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clínicas</h1>
        <CreateTenantDialog />
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Creada</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No hay clínicas todavía.
                </TableCell>
              </TableRow>
            )}
            {tenants.map((tenant) => (
              <TableRow key={tenant.id}>
                <TableCell>{tenant.name}</TableCell>
                <TableCell>{formatDate(tenant.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/platform/${tenant.id}/settings`}>
                      <SettingsIcon data-icon="inline-start" />
                      Configuración
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
