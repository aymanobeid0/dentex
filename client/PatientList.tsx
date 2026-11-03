import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, FileText, RefreshCw, Search } from 'lucide-react';
import { translations, type Lang } from './locales';

type Summary = { id: string; name: string; fileNumber: string; phone: string; isChild: boolean };
type Result = { items: Summary[]; page: number; hasNext: boolean };
type Failure = '' | 'denied' | 'network' | 'failed' | 'invalidSearch';

export function PatientList({ lang, onExpired }: { lang: Lang; onExpired: () => void }) {
  const t = translations[lang].patients;
  const [draft, setDraft] = useState('');
  const [request, setRequest] = useState({ q: '', page: 1, revision: 0 });
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<Failure>('');
  const [loading, setLoading] = useState(true);
  const pending = useRef(true), expired = useRef(onExpired);
  expired.current = onExpired;
  useEffect(() => {
    const controller = new AbortController();
    pending.current = true;
    fetch(`/api/clinic/patients?${new URLSearchParams({ q: request.q, page: String(request.page) })}`, { signal: controller.signal })
      .then(async response => {
        if (controller.signal.aborted) return;
        if (response.status === 401) { expired.current(); return; }
        if (!response.ok) { setError(response.status === 403 ? 'denied' : response.status === 400 ? 'invalidSearch' : 'failed'); return; }
        const data: Result = await response.json();
        if (!controller.signal.aborted) setResult(data);
      }).catch(() => { if (!controller.signal.aborted) setError('network'); })
      .finally(() => { if (!controller.signal.aborted) { pending.current = false; setLoading(false); } });
    return () => controller.abort();
  }, [request]);
  function load(q: string, page: number) {
    if (pending.current) return;
    pending.current = true; setResult(null); setError(''); setLoading(true);
    setRequest(previous => ({ q, page, revision: previous.revision + 1 }));
  }
  function search(event: FormEvent) { event.preventDefault(); load(draft.trim(), 1); }
  return <section className="card patient-list" aria-label={t.title}>
    <form className="patient-search" role="search" onSubmit={search}>
      <label className="field" htmlFor="patient-search"><span>{t.searchLabel}</span><span className="input-shell"><Search size={16} aria-hidden/><input id="patient-search" type="search" maxLength={200} value={draft} onChange={event => setDraft(event.target.value)} disabled={loading}/></span></label>
      <button className="primary action" disabled={loading}><Search size={16} aria-hidden/>{t.search}</button>
      {request.q && <button className="language" type="button" disabled={loading} onClick={() => { setDraft(''); load('', 1); }}>{t.clearSearch}</button>}
    </form>
    {loading ? <p role="status">{t.listLoading}</p> : error ? <div className="error" role="alert"><p>{t[error]}</p>{error !== 'denied' && <button className="language" onClick={() => load(request.q, request.page)}><RefreshCw size={16} aria-hidden/>{t.retry}</button>}</div>
      : result && <>
        {result.items.length === 0 ? <div className="patient-empty" role="status"><FileText size={24} aria-hidden/><p>{request.q ? t.noResults : request.page === 1 ? t.noPatients : t.emptyPage}</p></div>
          : <div className="table-scroll"><table><thead><tr><th scope="col">{t.name}</th><th scope="col">{t.number}</th><th scope="col">{t.phone}</th><th scope="col">{t.child}</th><th scope="col">{t.openFile}</th></tr></thead><tbody>{result.items.map(patient => <tr key={patient.id}><td><a href={`#patients/${encodeURIComponent(patient.id)}`}>{patient.name}</a></td><td><bdi>{patient.fileNumber}</bdi></td><td><bdi dir="ltr">{patient.phone}</bdi></td><td>{patient.isChild ? <span className="patient-child">{t.child}</span> : t.no}</td><td><a className="language" href={`#patients/${encodeURIComponent(patient.id)}`} aria-label={`${t.openFile}: ${patient.name}`}><FileText size={16} aria-hidden/>{t.openFile}</a></td></tr>)}</tbody></table></div>}
        <nav className="patient-pagination" aria-label={t.pages}><button className="language" disabled={result.page === 1} onClick={() => load(request.q, request.page - 1)}><ArrowLeft size={16} className="directional" aria-hidden/>{t.previous}</button><span>{t.page} <bdi>{result.page}</bdi></span><button className="language" disabled={!result.hasNext} onClick={() => load(request.q, request.page + 1)}>{t.next}<ArrowRight size={16} className="directional" aria-hidden/></button></nav>
      </>}
  </section>;
}
