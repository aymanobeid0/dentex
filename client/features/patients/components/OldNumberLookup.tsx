import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { History, Search } from "lucide-react";
import { Modal } from "../../../ui/Modal";
import { Label } from "../../../ui/Label";
import { useApi } from "../../../shared/api/RequestProvider";
import { ApiError } from "../../../shared/api/request";
import { useQueryScope } from "../../../shared/query/QueryScope";
import { useDisplayedQuery } from "../../../shared/query/useDisplayedQuery";
import { translations, type Lang } from "../../../shared/i18n";
import { lookupOldNumber } from "../api";
import { usePatientReadFailure } from "../queries";
import type { PatientView } from "../types";

function LookupContent({
  onNavigate,
  lang,
  onExpired,
}: {
  onNavigate: (view: PatientView) => void;
  lang: Lang;
  onExpired: () => void;
}) {
  const t = translations[lang].patients;
  const [input, setInput] = useState(""),
    [submitted, setSubmitted] = useState("");
  const [invalid, setInvalid] = useState(false);
  const request = useApi(),
    scope = useQueryScope(),
    client = useQueryClient();
  const key = [...scope, "patients", "numbering-history", submitted];
  const query = useDisplayedQuery(
    ["patients", "numbering-history", submitted],
    (signal) => lookupOldNumber(request, submitted, signal),
    onExpired,
    !!submitted,
  );
  usePatientReadFailure(query.error, onExpired);
  useEffect(
    () => () => {
      const filter = {
        queryKey: [...scope, "patients", "numbering-history", submitted],
        exact: true,
      };
      void client.cancelQueries(filter);
      client.removeQueries(filter);
    },
    [client, scope, submitted],
  );
  function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = input
      .trim()
      .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
      .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0));
    const valid =
      /^[1-9]\d*$/.test(normalized) &&
      normalized.length <= 19 &&
      BigInt(normalized) <= 9223372036854775807n;
    setInvalid(!valid);
    if (!valid || !query.online || query.isFetching) return;
    if (submitted === normalized)
      void client.invalidateQueries({ queryKey: key, exact: true });
    else setSubmitted(normalized);
  }
  const missing = query.error instanceof ApiError && query.error.status === 404;
  const denied =
    query.error instanceof ApiError && [401, 403].includes(query.error.status);
  return (
    <>
      <form onSubmit={submit} noValidate>
        <Label className="field" htmlFor="old-file-number">
          <span id="old-file-number-label">{t.oldNumber}</span>
          <span className="input-shell">
            <input
              id="old-file-number"
              aria-labelledby="old-file-number-label"
              dir="ltr"
              inputMode="numeric"
              maxLength={200}
              value={input}
              aria-invalid={invalid}
              aria-describedby={invalid ? "old-file-number-error" : undefined}
              onChange={(event) => {
                setInput(event.target.value);
                setSubmitted("");
                setInvalid(false);
              }}
            />
          </span>
        </Label>
        {invalid && (
          <p id="old-file-number-error" role="alert" className="field-error">
            {t.oldNumberInvalid}
          </p>
        )}
        <button
          className="primary action"
          disabled={!query.online || query.isFetching}
        >
          <Search size={16} aria-hidden />
          {t.search}
        </button>
      </form>
      {query.stale && <p role="status">{t.staleData}</p>}
      {submitted && query.isFetching && <p role="status">{t.loading}</p>}
      {submitted && query.error && (
        <p role="alert">
          {missing ? t.oldNumberMissing : denied ? t.denied : t.network}
        </p>
      )}
      {submitted && query.data && (
        <div aria-live="polite">
          <p>
            {t.number}: <bdi>{query.data.fileNumber}</bdi>
          </p>
          <p>
            <button
              type="button"
              className="patient-link"
              onClick={() => {
                if (query.data)
                  onNavigate({ kind: "file", patientId: query.data.id });
              }}
            >
              {query.data.name}
            </button>
          </p>
        </div>
      )}
    </>
  );
}

export function OldNumberLookup({
  onNavigate,
  lang,
  onExpired,
}: {
  onNavigate: (view: PatientView) => void;
  lang: Lang;
  onExpired: () => void;
}) {
  const [open, setOpen] = useState(false),
    t = translations[lang].patients;
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      direction={lang === "ar" ? "rtl" : "ltr"}
      title={t.oldNumberLookup}
      description={t.oldNumberHint}
      close={t.closeLookup}
      trigger={
        <button className="language">
          <History size={16} aria-hidden />
          {t.oldNumberLookup}
        </button>
      }
    >
      {open && (
        <LookupContent
          lang={lang}
          onExpired={onExpired}
          onNavigate={onNavigate}
        />
      )}
    </Modal>
  );
}
