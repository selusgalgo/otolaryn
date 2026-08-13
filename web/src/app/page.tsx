import { redirect } from "next/navigation";

// Always the same destination — role-specific routing (superadmin -> /platform,
// everyone else -> /dashboard) happens once, in (app)/layout.tsx, rather than
// duplicated here.
export default function Home() {
  redirect("/dashboard");
}
