import { redirect } from "next/navigation";
import { SETTINGS_SECTIONS } from "@/components/settings/settings-sections";

// Configuración used to give each section its own URL
// (/settings/schedule, …). They're all blocks of /settings now — keep any
// old link or bookmark working by landing on the matching block.
export default async function LegacySettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const known = SETTINGS_SECTIONS.some((s) => s.id === section);
  redirect(known ? `/settings#${section}` : "/settings");
}
