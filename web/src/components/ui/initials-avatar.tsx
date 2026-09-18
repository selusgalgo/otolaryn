const SIZE_CLASSES = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
};

interface InitialsAvatarProps {
  firstName: string;
  lastName: string;
  size?: keyof typeof SIZE_CLASSES;
}

export function InitialsAvatar({ firstName, lastName, size = "md" }: InitialsAvatarProps) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 select-none items-center justify-center rounded-full bg-stock font-bold text-muted-foreground ${SIZE_CLASSES[size]}`}
    >
      {initials}
    </div>
  );
}
