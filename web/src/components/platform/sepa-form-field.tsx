import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface SepaFormFieldProps extends React.ComponentProps<typeof Input> {
  name: string;
  label: string;
  hint?: string;
  className?: string;
}

// Label + input + optional hint, shared by the two SEPA forms (Datos de
// facturación, Orden SEPA de una clínica). `className` goes on the wrapper
// so callers can span grid columns.
export function SepaFormField({
  name,
  label,
  hint,
  className,
  ...inputProps
}: SepaFormFieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={name}>
        {label}
        {!inputProps.required && (
          <span className="font-normal text-muted-foreground"> (opcional)</span>
        )}
      </Label>
      <Input id={name} name={name} {...inputProps} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
