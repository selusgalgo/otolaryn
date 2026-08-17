"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UserForm } from "@/components/users/user-form";
import { createUserAction } from "@/lib/actions/users";
import type { UserFormState } from "@/lib/actions/users";

interface CreateUserDialogProps {
  // Defaults to the admin's own tenant (createUserAction, tenant comes
  // from the caller's own JWT). superadmin's clinic overview page passes
  // createTenantUserAction bound to the chosen clinic instead — same form,
  // different tenant.
  action?: (prevState: UserFormState, formData: FormData) => Promise<UserFormState>;
}

export function CreateUserDialog({ action = createUserAction }: CreateUserDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon data-icon="inline-start" />
          Nuevo usuario
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
        </DialogHeader>
        <UserForm
          action={action}
          submitLabel="Crear usuario"
          submitIcon={<PlusIcon data-icon="inline-start" />}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
