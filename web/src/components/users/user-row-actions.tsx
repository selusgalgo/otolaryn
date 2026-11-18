"use client";

import { useState, useTransition } from "react";
import {
  NoSymbolIcon,
  PencilIcon,
  TrashIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import { DeactivateUserDialog } from "@/components/users/deactivate-user-dialog";
import { DeleteUserDialog } from "@/components/users/delete-user-dialog";
import { EditUserDialog } from "@/components/users/edit-user-dialog";
import type { UserFormState } from "@/lib/actions/users";
import { userDisplayName } from "@/lib/doctor-name";
import { RowActions } from "@/components/ui/row-actions";
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
  // Same reasoning/omission as deleteAction — deactivating is that clinic's
  // own admin's call too.
  setActiveAction?: (active: boolean) => Promise<{ error?: string }>;
}

// Same "dialogs live outside DropdownMenuContent, as siblings" pattern as
// AppointmentRowActions/PatientRowActions — each dialog keeps its own open
// state, driven by the menu items here, so it stays open after the menu
// itself closes on select.
export function UserRowActions({
  user,
  updateAction,
  resetPasswordAction,
  deleteAction,
  setActiveAction,
}: UserRowActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [reactivating, startReactivating] = useTransition();

  return (
    <>
      <RowActions
        overflowLabel={`Más acciones para ${userDisplayName(user)}`}
        actions={[
          { id: "edit", label: `Editar a ${userDisplayName(user)}`, icon: <PencilIcon />, onSelect: () => setEditOpen(true) },
          ...(setActiveAction
            ? [
                user.active
                  ? {
                      id: "deactivate",
                      label: `Desactivar a ${userDisplayName(user)}`,
                      icon: <NoSymbolIcon />,
                      onSelect: () => setDeactivateOpen(true),
                    }
                  : {
                      id: "reactivate",
                      label: `Reactivar a ${userDisplayName(user)}`,
                      icon: <CheckCircleIcon />,
                      onSelect: () =>
                        startReactivating(async () => {
                          await setActiveAction(true);
                        }),
                      disabled: reactivating,
                    },
              ]
            : []),
          ...(deleteAction
            ? [
                {
                  id: "delete",
                  label: `Eliminar a ${userDisplayName(user)}`,
                  icon: <TrashIcon />,
                  onSelect: () => setDeleteOpen(true),
                  destructive: true,
                },
              ]
            : []),
        ]}
      />

      <EditUserDialog
        user={user}
        updateAction={updateAction}
        resetPasswordAction={resetPasswordAction}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      {setActiveAction && (
        <DeactivateUserDialog
          user={user}
          deactivateAction={() => setActiveAction(false)}
          open={deactivateOpen}
          onOpenChange={setDeactivateOpen}
        />
      )}
      {deleteAction && (
        <DeleteUserDialog user={user} deleteAction={deleteAction} open={deleteOpen} onOpenChange={setDeleteOpen} />
      )}
    </>
  );
}
