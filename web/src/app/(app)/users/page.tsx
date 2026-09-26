import { redirect } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateUserDialog } from "@/components/users/create-user-dialog";
import { RoleBadge } from "@/components/users/role-badge";
import { UserRowActions } from "@/components/users/user-row-actions";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { apiFetch } from "@/lib/api";
import { deleteUserAction, updateUserAction, resetUserPasswordAction } from "@/lib/actions/users";
import { getCurrentUser } from "@/lib/auth";
import { STAFF_FUNCTION_LABELS } from "@/lib/roles";
import type { AppUser } from "@/lib/types";

export default async function UsersPage() {
  const me = await getCurrentUser();
  // Not in the sidebar for anyone else, but guard the route itself too —
  // the backend would 403 the GET below anyway, this just avoids a broken
  // page if a non-admin lands here directly.
  if (me.role !== "admin") {
    redirect("/dashboard");
  }

  const users = await apiFetch<AppUser[]>("/users");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Usuarios</h1>
        <CreateUserDialog />
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No hay usuarios todavía.
                </TableCell>
              </TableRow>
            )}
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <InitialsAvatar firstName={user.firstName} lastName={user.lastName} size="sm" />
                    {user.firstName} {user.lastName}
                  </div>
                </TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <RoleBadge role={user.role} />
                    {user.staffFunction && (
                      <span className="text-xs text-muted-foreground">
                        · también {STAFF_FUNCTION_LABELS[user.staffFunction]}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <UserRowActions
                    user={user}
                    updateAction={updateUserAction.bind(null, user.id)}
                    resetPasswordAction={resetUserPasswordAction.bind(null, user.id)}
                    deleteAction={deleteUserAction.bind(null, user.id)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
