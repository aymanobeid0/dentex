import type { FormEvent } from 'react';
import { ArrowLeft, ArrowRight, FileText, RefreshCw, Search } from 'lucide-react';
import { translations, type Lang } from './locales';
import { Label } from './ui/Label';
import { ScreenReaderStatus } from './ui/ScreenReaderStatus';
import { usePatientSearch } from './usePatientSearch';

export function PatientList({ lang, onExpired }: { lang: Lang; onExpired: () => void }) {
  const t = translations[lang].patients;
  const { draft, request, result, error, loading, change, clear, load, search, searchPending, compositionStart, compositionEnd } = usePatientSearch(onExpired);
  function submit(event: FormEvent) { event.preventDefault(); search(); }
  const status = loading ? (result ? t.updating : t.listLoading) : error || !result ? ''
    : t.resultsShown.replace('{count}', String(result.items.length));
  return <section className="card patient-list" aria-label={t.title}>
    <form className="patient-search" role="search" onSubmit={submit}>
      <Label className="field" htmlFor="patient-search"><span>{t.searchLabel}</span><span className="input-shell"><Search size={16} aria-hidden/><input id="patient-search" type="search" maxLength={200} value={draft} onChange={event => change(event.target.value)} onCompositionStart={compositionStart} onCompositionEnd={event => compositionEnd(event.currentTarget.value)}/></span></Label>
      <button className="primary action" disabled={searchPending}><Search size={16} aria-hidden/>{t.search}</button>
      {(draft || request.q) && <button className="language" type="button" onClick={clear}>{t.clearSearch}</button>}
    </form>
    <ScreenReaderStatus>{status}</ScreenReaderStatus>
    {loading && <p className="patient-search-feedback" aria-hidden="true">{result ? t.updating : t.listLoading}</p>}
    {error ? <div className="error" role="alert"><p>{t[error]}</p>{error !== 'denied' && <button className="language" onClick={() => load(request.q, request.page)}><RefreshCw size={16} aria-hidden/>{t.retry}</button>}</div>
      : result && <>
        {result.items.length === 0 ? !loading && <div className="patient-empty"><FileText size={24} aria-hidden/><p>{request.q ? t.noResults : request.page === 1 ? t.noPatients : t.emptyPage}</p></div>
          : <div className="table-scroll" aria-busy={loading}><table><thead><tr><th scope="col">{t.name}</th><th scope="col">{t.number}</th><th scope="col">{t.phone}</th><th scope="col">{t.child}</th><th scope="col">{t.openFile}</th></tr></thead><tbody>{result.items.map(patient => <tr key={patient.id}><td><a href={`#patients/${encodeURIComponent(patient.id)}`}>{patient.name}</a></td><td><bdi>{patient.fileNumber}</bdi></td><td><bdi dir="ltr">{patient.phone}</bdi></td><td>{patient.isChild ? <span className="patient-child">{t.child}</span> : t.no}</td><td><a className="language" href={`#patients/${encodeURIComponent(patient.id)}`} aria-label={`${t.openFile}: ${patient.name}`}><FileText size={16} aria-hidden/>{t.openFile}</a></td></tr>)}</tbody></table></div>}
        <nav className="patient-pagination" aria-label={t.pages}><button className="language" disabled={loading || result.page === 1} onClick={() => load(request.q, request.page - 1)}><ArrowLeft size={16} className="directional" aria-hidden/>{t.previous}</button><span>{t.page} <bdi>{result.page}</bdi></span><button className="language" disabled={loading || !result.hasNext} onClick={() => load(request.q, request.page + 1)}>{t.next}<ArrowRight size={16} className="directional" aria-hidden/></button></nav>
      </>}
  </section>;
}
