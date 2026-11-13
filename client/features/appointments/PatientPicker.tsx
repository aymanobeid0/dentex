import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { translations, type Lang } from "../../shared/i18n";
import { UserRound } from "lucide-react";
import { Label } from "../../ui/Label";
import { Disclosure, DisclosureContent } from "../../ui/Disclosure";
import { useAppointmentPatients } from "./queries";
import type { PatientChoice } from "./api";

export function PatientPicker({
  lang,
  canWrite,
  disabled,
  selected,
  onSelect,
  onExpired,
  onRegister,
  inputRef,
}: {
  lang: Lang;
  canWrite: boolean;
  disabled: boolean;
  selected?: {
    id: string;
    name: string;
    fileNumber: string;
    archived: boolean;
  };
  onSelect: (patient: PatientChoice) => void;
  onExpired: () => void;
  onRegister?: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const t = translations[lang].appointments,
    id = useId();
  const root = useRef<HTMLDivElement>(null),
    localInput = useRef<HTMLInputElement>(null),
    input = inputRef || localInput;
  const [text, setText] = useState(""),
    [search, setSearch] = useState({ q: "", page: 1 }),
    [expanded, setExpanded] = useState(false),
    [active, setActive] = useState(-1),
    [composing, setComposing] = useState(false);
  const term = text.trim();
  const open = expanded && !!term && canWrite && !disabled;
  const ready = open && !composing && search.q === term;
  const query = useAppointmentPatients(search.q, search.page, ready, onExpired);
  const items = query.data?.items || [];
  const pending = !ready || query.isPending;
  const activeIndex = Math.min(active, items.length - 1);
  useEffect(() => {
    if (composing) return;
    const timer = setTimeout(() => {
      setSearch({ q: term, page: 1 });
      setActive(-1);
    }, 250);
    return () => clearTimeout(timer);
  }, [term, composing]);
  useLayoutEffect(() => {
    if (selected) input.current?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setExpanded(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  useEffect(() => {
    if (open && activeIndex >= 0)
      document
        .getElementById(`${id}-option-${activeIndex}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, id]);
  function choose(item: PatientChoice) {
    setExpanded(false);
    setText("");
    setSearch({ q: "", page: 1 });
    setActive(-1);
    onSelect(item);
    input.current?.focus();
  }
  return (
    <section className="appointment-picker" aria-label={t.patient}>
      {selected && (
        <div className="ui-selected-person" role="status">
          <span className="ui-person-avatar">
            <UserRound size={16} aria-hidden />
          </span>
          <strong>{selected.name}</strong>
          <bdi>{selected.fileNumber}</bdi>
        </div>
      )}
      <Disclosure
        ref={root}
        className="appointment-patient-search"
        open={open}
        onOpenChange={setExpanded}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node))
            setExpanded(false);
        }}
      >
        <Label className="ui-sr-only" htmlFor={id}>
          {t.patientSearch}
        </Label>
        <input
          ref={input}
          className="ui-input"
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? `${id}-results` : undefined}
          aria-activedescendant={
            open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined
          }
          placeholder={t.patientNameSearch}
          autoComplete="off"
          maxLength={200}
          value={text}
          disabled={disabled || !canWrite}
          onFocus={() => setExpanded(true)}
          onChange={(event) => {
            setText(event.target.value);
            setExpanded(true);
            setActive(-1);
          }}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Escape" && open) {
              event.preventDefault();
              event.stopPropagation();
              setExpanded(false);
              return;
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setExpanded(true);
              if (items.length)
                setActive((previous) =>
                  event.key === "ArrowDown"
                    ? (previous + 1) % items.length
                    : previous <= 0
                      ? items.length - 1
                      : previous - 1,
                );
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (open && activeIndex >= 0 && items[activeIndex])
                choose(items[activeIndex]);
            }
          }}
        />
        <DisclosureContent className="ui-search-popup">
          {pending && query.online && (
            <p className="ui-search-message" role="status">
              {t.loading}
            </p>
          )}
          {!query.online && (
            <p className="ui-search-message" role="status">
              {t.offline}
            </p>
          )}
          {ready && query.isError && (
            <div className="ui-search-message">
              <p role="alert">{query.blocked ? t.readDenied : t.failed}</p>
              <button
                type="button"
                className="ui-button"
                disabled={!query.online || query.isFetching}
                onClick={() => void query.refetch()}
              >
                {t.refresh}
              </button>
            </div>
          )}
          <ul
            id={`${id}-results`}
            className="ui-search-results"
            role="listbox"
            aria-label={t.matchingPatients}
            aria-busy={pending}
          >
            {items.map((item, index) => (
              <li
                key={item.id}
                id={`${id}-option-${index}`}
                role="option"
                className="ui-search-option"
                aria-selected={activeIndex === index}
                onMouseMove={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(item)}
              >
                <strong>{item.name}</strong>
                <small>
                  {t.fileNumber} <bdi>{item.fileNumber}</bdi> ·{" "}
                  <bdi dir="ltr">{item.phone}</bdi>
                </small>
              </li>
            ))}
          </ul>
          {query.data && items.length === 0 && !pending && !query.isError && (
            <div className="ui-search-message">
              <p role="status">{t.noPatients}</p>
              {onRegister && (
                <button
                  type="button"
                  className="ui-link-button"
                  onClick={onRegister}
                >
                  {t.registerPatient}
                </button>
              )}
            </div>
          )}
          {query.data && (search.page > 1 || query.data.hasNext) && (
            <div className="ui-search-pagination">
              <button
                type="button"
                className="ui-button"
                disabled={search.page === 1 || query.isFetching}
                onClick={() => {
                  setActive(-1);
                  setSearch((previous) => ({
                    ...previous,
                    page: previous.page - 1,
                  }));
                }}
              >
                {t.previous}
              </button>
              <span>
                {t.page} <bdi>{search.page}</bdi>
              </span>
              <button
                type="button"
                className="ui-button"
                disabled={!query.data.hasNext || query.isFetching}
                onClick={() => {
                  setActive(-1);
                  setSearch((previous) => ({
                    ...previous,
                    page: previous.page + 1,
                  }));
                }}
              >
                {t.next}
              </button>
            </div>
          )}
        </DisclosureContent>
      </Disclosure>
    </section>
  );
}
