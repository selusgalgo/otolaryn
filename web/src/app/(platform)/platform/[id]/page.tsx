import Link from "next/link";
import { ArrowDownTrayIcon, ArrowLeftIcon, BanknotesIcon, Cog6ToothIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateUserDialog } from "@/components/users/create-user-dialog";
import { SepaStatusBadge } from "@/components/platform/sepa-signing-panel";
import { UserRowActions } from "@/components/users/user-row-actions";
import { apiFetch } from "@/lib/api";
import { userDisplayName } from "@/lib/doctor-name";
import { formatDocumentId } from "@/lib/utils";
import {
  createTenantUserAction,
  resetTenantUserPasswordAction,
  updateTenantUserAction,
} from "@/lib/actions/platform";
import { ROLE_LABELS, STAFF_FUNCTION_LABELS } from "@/lib/roles";
import { computeSepaAmounts, formatCents } from "@/lib/sepa";
import type { AppUser, Paginated, Patient, Tenant, TenantSepaMandate } from "@/lib/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { dateStyle: "medium" });
}

export default async function TenantOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [tenant, patients, users, sepa] = await Promise.all([
    apiFetch<Tenant>(`/platform/tenants/${id}`),
    // Read-only here on purpose — superadmin can see a clinic's patients to
    // help out, but editing them (and their clinical history/agenda) stays
    // the clinic's own staff's job. pageSize 100 with no pager yet: fine
    // for how large a single clinic's patient list realistically gets
    // today, would need real pagination before that stops being true.
    apiFetch<Paginated<Patient>>(`/platform/tenants/${id}/patients?pageSize=100`),
    apiFetch<AppUser[]>(`/platform/tenants/${id}/users`),
    apiFetch<TenantSepaMandate>(`/platform/tenants/${id}/sepa-mandate`),
  ]);
  const mandate = sepa.mandate;
  const monthlyDebit = mandate
    ? formatCents(computeSepaAmounts(mandate.monthlyBase, mandate.vatPercent, mandate.irpfPercent).totalCents)
    : null;

  return (
    <div className="space-y-4">
      <Link href="/platform" className="flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" />
        Clínicas
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{tenant.name}</h1>
          <p className="text-sm text-muted-foreground">Creada el {formatDate(tenant.createdAt)}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/platform/${id}/settings`}>
            <Cog6ToothIcon data-icon="inline-start" />
            Configuración
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Domiciliación SEPA</CardTitle>
          <div className="flex flex-wrap gap-2">
            {mandate && (
              <Button asChild variant="outline" size="sm">
                <a href={`/platform/${id}/sepa/${mandate.status === "firmada" ? "signed-pdf" : "pdf"}`} download>
                  <ArrowDownTrayIcon data-icon="inline-start" />
                  {mandate.status === "firmada" ? "Descargar PDF firmado" : "Vista previa del PDF"}
                </a>
              </Button>
            )}
            <Button asChild size="sm" variant={mandate ? "outline" : "default"}>
              <Link href={`/platform/${id}/sepa`}>
                <BanknotesIcon data-icon="inline-start" />
                {mandate ? "Gestionar orden" : "Crear orden"}
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {mandate ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">Referencia</dt>
                <dd className="font-medium">{mandate.reference}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Estado</dt>
                <dd>
                  <SepaStatusBadge status={mandate.status} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Plan</dt>
                <dd className="font-medium">{mandate.planName}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Cargo mensual</dt>
                <dd className="font-medium">{monthlyDebit}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sin orden de domiciliación. Créala y envía a la clínica el enlace para que rellene sus datos y firme.
            </p>
          )}
        </CardContent>
      </Card>

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
                        <TableCell>{formatDocumentId(patient.documentId)}</TableCell>
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
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          {userDisplayName(user)}
                          <div className="text-xs text-muted-foreground">{user.email}</div>
                        </TableCell>
                        <TableCell>
                          {ROLE_LABELS[user.role] ?? user.role}
                          {user.staffFunction && (
                            <span className="text-xs text-muted-foreground">
                              {" "}
                              · también {STAFF_FUNCTION_LABELS[user.staffFunction]}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <UserRowActions
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
