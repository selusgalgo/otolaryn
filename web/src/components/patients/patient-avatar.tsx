const AVATAR_COLORS = [
  "#1a73e8",
  "#d93025",
  "#188038",
  "#f9ab00",
  "#9334e6",
  "#e8710a",
  "#12b5cb",
  "#c2185b",
];

// Deterministic so the same patient always gets the same color across
// pages (list, detail, search results) without storing anything.
function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const SIZE_CLASSES = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
};

interface PatientAvatarProps {
  firstName: string;
  lastName: string;
  size?: keyof typeof SIZE_CLASSES;
}

export function PatientAvatar({ firstName, lastName, size = "md" }: PatientAvatarProps) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 select-none items-center justify-center rounded-full font-medium text-white ${SIZE_CLASSES[size]}`}
      style={{ backgroundColor: colorForName(`${firstName} ${lastName}`) }}
    >
      {initials}
    </div>
  );
}
