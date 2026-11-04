import { useEffect, useRef, useState } from 'react';

export type PatientSummary = { id: string; name: string; fileNumber: string; phone: string; isChild: boolean };
type Result = { items: PatientSummary[]; page: number; hasNext: boolean };
type Failure = '' | 'denied' | 'network' | 'failed' | 'invalidSearch';

export function usePatientSearch(onExpired: () => void) {
  const [draft, setDraft] = useState('');
  const [request, setRequest] = useState({ q: '', page: 1, version: 0 });
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<Failure>('');
  const [loading, setLoading] = useState(true);
  const active = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0), pendingKey = useRef<string | null>(null);
  const composing = useRef(false), typed = useRef(''), expired = useRef(onExpired);
  expired.current = onExpired;
  function clearTimer() { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; }
  function cancel() { active.current?.abort(); generation.current++; pendingKey.current = null; }
  function load(q: string, page: number) {
    clearTimer();
    const key = JSON.stringify([q, page]);
    if (pendingKey.current === key) return;
    cancel(); pendingKey.current = key;
    setLoading(true); setError('');
    setRequest({ q, page, version: generation.current });
  }
  useEffect(() => {
    if (request.version !== generation.current) return;
    const controller = new AbortController(); active.current = controller;
    pendingKey.current = JSON.stringify([request.q, request.page]);
    const current = () => !controller.signal.aborted && request.version === generation.current;
    fetch(`/api/clinic/patients?${new URLSearchParams({ q: request.q, page: String(request.page) })}`, { signal: controller.signal })
      .then(async response => {
        if (!current()) return;
        if (response.status === 401) { expired.current(); return; }
        if (!response.ok) {
          setResult(null); setError(response.status === 403 ? 'denied' : response.status === 400 ? 'invalidSearch' : 'failed'); return;
        }
        const data: Result = await response.json();
        if (current()) setResult(data);
      }).catch(() => { if (current()) { setResult(null); setError('network'); } })
      .finally(() => { if (current()) { pendingKey.current = null; setLoading(false); } });
    return () => controller.abort();
  }, [request]);
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); active.current?.abort(); }, []);
  function change(value: string, force = false) {
    const unchanged = value.trim() === typed.current.trim();
    typed.current = value; setDraft(value);
    if (unchanged && !force) return;
    clearTimer(); cancel(); setLoading(true); setError('');
    if (!composing.current) timer.current = setTimeout(() => load(value.trim(), 1), 300);
  }
  function clear() { composing.current = false; typed.current = ''; setDraft(''); load('', 1); }
  function compositionStart() { composing.current = true; clearTimer(); cancel(); setLoading(true); }
  function compositionEnd(value: string) { composing.current = false; change(value, true); }
  function search() { if (!composing.current) load(typed.current.trim(), 1); }
  const searchPending = pendingKey.current === JSON.stringify([draft.trim(), 1]);
  return { draft, request, result, error, loading, change, clear, load, search, searchPending, compositionStart, compositionEnd };
}
