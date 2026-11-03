import { SETTINGS_SECTIONS } from "./settings-sections";

// One block of the Configuración page: anchor target for the side menu,
// plus the title + one-line description taken from the same list as the
// menu. scroll-mt clears the sticky pill row on mobile when jumping here.
export function SettingsSection({ id, children }: { id: string; children: React.ReactNode }) {
  const section = SETTINGS_SECTIONS.find((s) => s.id === id);
  if (!section) return null;

  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 space-y-4 lg:scroll-mt-6">
      <div className="space-y-1">
        <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight">
          {section.title}
        </h2>
        <p className="text-sm text-muted-foreground">{section.description}</p>
      </div>
      {children}
    </section>
  );
}
