import { render, type RenderOptions } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Session, SessionProvider } from '../client/session';
import { createSessionRequest, RequestContext } from '../client/api';
import { notifyManager } from '@tanstack/react-query';

// Keep query notifications in act's microtask queue when a test controls timers.
notifyManager.setScheduler(queueMicrotask);

// Most existing UI cases isolate HTTP outcomes from retry timing. Retry behavior
// and the full session boundary are exercised through App in integration cases.
export function renderPatient(ui: ReactNode, options?: RenderOptions) {
  const session = new Session(() => {}, { kind: 'clinic', username: 'test-reader', name: 'Reader', clinic: { id: 'test-clinic', name: 'Test clinic', code: '2000' }, roles: ['admin'], permissions: ['patients.read', 'patients.write'] });
  session.client.setDefaultOptions({ queries: { retry: false, gcTime: 0 } });
  // Component-level cases observe onExpired; App cases verify the cache-clearing
  // owner that normally unmounts these components before that callback runs.
  const transport = createSessionRequest(() => {});
  function Wrapper({ children }: { children: ReactNode }) { return <SessionProvider session={session}><RequestContext value={transport.request}>{children}</RequestContext></SessionProvider>; }
  return render(ui, { ...options, wrapper: Wrapper });
}
