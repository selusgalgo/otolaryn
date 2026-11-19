import { redirect } from 'next/navigation';
import { PlatformSidebar } from '@/components/layout/platform-sidebar';
import { SessionGuard } from '@/components/layout/session-guard';
import { getCurrentUser } from '@/lib/auth';

// Superadmin has its own navigation because it manages platform-wide clinics
// and billing rather than tenant-scoped patient and agenda pages.
export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getCurrentUser();

  if (me.role !== 'superadmin') {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-surface">
      <PlatformSidebar me={me} />
      <main className="pb-16 md:pb-0 md:pl-60">
        <div className="mx-auto max-w-[1080px] px-4 py-6">{children}</div>
      </main>
      <SessionGuard />
    </div>
  );
}
