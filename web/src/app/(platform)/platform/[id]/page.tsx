import Link from "next/link";
import { ArrowLeftIcon, SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateUserDialog } from "@/components/users/create-user-dialog";
import { EditUserDialog } from "@/components/users/edit-user-dialog";
import { apiFetch } from "@/lib/api";
import {
  createTenantUserAction,
  resetTenantUserPasswordAction,
  updateTenantUserAction,
} from "@/lib/actions/platform";
import { ROLE_LABELS } from "@/lib/roles";
import type { AppUser, Paginated, Patient, Tenant } from "@/lib/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { dateStyle: "medium" });
}

export default async function TenantOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [tenant, patients, users] = await Promise.all([
    apiFetch<Tenant>(`/platform/tenants/${id}`),
    // Read-only here on purpose — superadmin can see a clinic's patients to
    // help out, but editing them (and their clinical history/agenda) stays
    // the clinic's own staff's job. pageSize 100 with no pager yet: fine
    // for how large a single clinic's patient list realistically gets
    // today, would need real pagination before that stops being true.
    apiFetch<Paginated<Patient>>(`/platform/tenants/${id}/patients?pageSize=100`),
    apiFetch<AppUser[]>(`/platform/tenants/${id}/users`),
  ]);

  return (
    <div className="space-y-4">
      <Link href="/platform" className="flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" />
        Clínicas
      </Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{tenant.name}</h1>
          <p className="text-sm text-muted-foreground">Creada el {formatDate(tenant.createdAt)}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/platform/${id}/settings`}>
            <SettingsIcon data-icon="inline-start" />
            Configuración
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pacientes</CardTitle>
          </CardHeader>
          <CardContent>
            {patients.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin pacientes todavía.</p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Documento</TableHead>
                      <TableHead>Teléfono</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {patients.data.map((patient) => (
                      <TableRow key={patient.id}>
                        <TableCell>
                          {patient.firstName} {patient.lastName}
                        </TableCell>
                        <TableCell>{patient.documentId}</TableCell>
                        <TableCell>{patient.phone}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Usuarios</CardTitle>
            <CreateUserDialog action={createTenantUserAction.bind(null, id)} />
          </CardHeader>
          <CardContent>
            {users.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin usuarios todavía.</p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          {user.firstName} {user.lastName}
                          <div className="text-xs text-muted-foreground">{user.email}</div>
                        </TableCell>
                        <TableCell>{ROLE_LABELS[user.role] ?? user.role}</TableCell>
                        <TableCell className="text-right">
                          <EditUserDialog
                            user={user}
                            updateAction={updateTenantUserAction.bind(null, id, user.id)}
                            resetPasswordAction={resetTenantUserPasswordAction.bind(null, id, user.id)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
