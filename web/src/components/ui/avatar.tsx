import { cn } from "@/lib/utils";

interface AvatarProps {
  firstName: string;
  lastName: string;
  // No photo-upload feature exists yet (nothing in AccountProfile/AppUser
  // carries a URL) — this prop is here so wiring one up later is a drop-in,
  // not a rewrite. Until then it's always undefined and the circle always
  // shows initials.
  src?: string | null;
  className?: string;
}

function initialsOf(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function Avatar({ firstName, lastName, src, className }: AvatarProps) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-foreground/15 text-sm font-semibold text-primary-foreground",
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatar source is arbitrary/user-provided, next/image's optimizer doesn't apply
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        initialsOf(firstName, lastName)
      )}
    </span>
  );
}
