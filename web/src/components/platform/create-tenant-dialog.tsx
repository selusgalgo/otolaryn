"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TenantForm } from "@/components/platform/tenant-form";
import { createTenantAction } from "@/lib/actions/platform";

export function CreateTenantDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon data-icon="inline-start" />
          Nueva clínica
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva clínica</DialogTitle>
        </DialogHeader>
        <TenantForm
          action={createTenantAction}
          submitLabel="Crear clínica"
          submitIcon={<PlusIcon data-icon="inline-start" />}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
