'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveAgendaView, type AgendaView } from '@/lib/actions/agenda-view';
import { cn } from '@/lib/utils';

export function AgendaViewSwitch({ view, hrefs }: { view: AgendaView; hrefs: Record<AgendaView, string> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const labels = { day: 'Día', week: 'Semana', month: 'Mes' } as const;

  return <div>
    <nav aria-label="Vista de agenda" className="flex items-center gap-1 rounded-full bg-muted p-1">
      {(['day', 'week', 'month'] as const).map((target) => <button
        key={target}
        type="button"
        aria-current={view === target ? 'page' : undefined}
        disabled={pending}
        onClick={() => {
          setError('');
          startTransition(async () => {
            const result = await saveAgendaView(target);
            if (result.error) { setError(result.error); return; }
            router.push(hrefs[target]);
          });
        }}
        className={cn('rounded-full px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-60', view === target ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
      >{labels[target]}</button>)}
    </nav>
    {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
  </div>;
}
