"use client";

import { useState } from "react";
import { EllipsisVerticalIcon, PencilIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteUserDialog } from "@/components/users/delete-user-dialog";
import { EditUserDialog } from "@/components/users/edit-user-dialog";
import type { UserFormState } from "@/lib/actions/users";
import type { AppUser } from "@/lib/types";

interface UserRowActionsProps {
  user: AppUser;
  updateAction: (prevState: UserFormState, formData: FormData) => Promise<UserFormState>;
  resetPasswordAction: (prevState: UserFormState, formData: FormData) => Promise<UserFormState>;
  // Omitted on /platform's tenant-users table — superadmin can edit a
  // clinic's users but there's no platform-level delete endpoint (deleting
  // a clinic's admin/staff is that clinic's own admin's call, not
  // superadmin's, at least for now). The menu just skips the item and its
  // dialog when this isn't passed, rather than needing a near-duplicate
  // component for that one page.
  deleteAction?: () => Promise<{ error?: string }>;
}

// Same "dialogs live outside DropdownMenuContent, as siblings" pattern as
// AppointmentRowActions/PatientRowActions — each dialog keeps its own open
// state, driven by the menu items here, so it stays open after the menu
// itself closes on select.
export function UserRowActions({ user, updateAction, resetPasswordAction, deleteAction }: UserRowActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Acciones para ${user.firstName} ${user.lastName}`}
          >
            <EllipsisVerticalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <PencilIcon data-icon="inline-start" />
            Editar
          </DropdownMenuItem>
          {deleteAction && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive"
                onSelect={() => setDeleteOpen(true)}
              >
                <TrashIcon data-icon="inline-start" />
                Eliminar
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <EditUserDialog
        user={user}
        updateAction={updateAction}
        resetPasswordAction={resetPasswordAction}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      {deleteAction && (
        <DeleteUserDialog user={user} deleteAction={deleteAction} open={deleteOpen} onOpenChange={setDeleteOpen} />
      )}
    </>
  );
}
