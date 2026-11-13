import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  CalendarDays,
  Clock3,
  ChevronLeft,
  ChevronRight,
  Check,
} from "lucide-react";
import { translations, type Lang } from "../shared/i18n";
import { Modal } from "./Modal";
import { IconButton } from "./IconButton";
import { Label } from "./Label";
import { SelectField } from "./SelectField";

type Props = {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  lang: Lang;
  disabled?: boolean;
};
const pad = (value: number) => String(value).padStart(2, "0");
const locale = (lang: Lang) => (lang === "ar" ? "ar-MR-u-nu-latn" : "fr-FR");
function utcDate(year: number, month: number, day: number) {
  const value = new Date(0);
  value.setUTCHours(12, 0, 0, 0);
  value.setUTCFullYear(year, month, day);
  return value;
}
const key = (date: Date) => date.toISOString().slice(0, 10);
function formats(lang: Lang) {
  const options = { calendar: "gregory", timeZone: "UTC" };
  return {
    full: new Intl.DateTimeFormat(locale(lang), {
      ...options,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    short: new Intl.DateTimeFormat(locale(lang), {
      ...options,
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    month: new Intl.DateTimeFormat(locale(lang), { ...options, month: "long" }),
    weekday: new Intl.DateTimeFormat(locale(lang), {
      ...options,
      weekday: "long",
    }),
    narrow: new Intl.DateTimeFormat(locale(lang), {
      ...options,
      weekday: "narrow",
    }),
  };
}
const calendarFormats = { ar: formats("ar"), fr: formats("fr") };
const dateLabel = (value: string, lang: Lang) =>
  calendarFormats[lang].full.format(new Date(value + "T12:00:00Z"));
const shortDate = (value: string, lang: Lang) =>
  calendarFormats[lang].short.format(new Date(value + "T12:00:00Z"));
const monthOptions = (lang: Lang) =>
  Array.from({ length: 12 }, (_, index) => ({
    value: String(index),
    label: calendarFormats[lang].month.format(utcDate(2026, index, 1)),
  }));
const allMonths = { ar: monthOptions("ar"), fr: monthOptions("fr") };

export function DateField({
  id,
  label,
  value,
  onValueChange,
  lang,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false),
    t = translations[lang].dateTime;
  function choose(day: string) {
    onValueChange(day);
    setOpen(false);
  }
  return (
    <Modal
      size="compact"
      open={open}
      onOpenChange={setOpen}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        document
          .getElementById(`${id}-calendar`)
          ?.querySelector<HTMLElement>('[tabindex="0"]')
          ?.focus();
      }}
      title={label}
      description={t.chooseDate}
      close={t.close}
      direction={lang === "ar" ? "rtl" : "ltr"}
      headerIcon={<CalendarDays size={18} aria-hidden />}
      footer={
        <div className="ui-picker-footer">
          <button
            type="button"
            className="ui-button"
            onClick={() => choose(new Date().toISOString().slice(0, 10))}
          >
            {t.today}
          </button>
        </div>
      }
      trigger={
        <button
          id={id}
          type="button"
          value={value}
          className="ui-input ui-picker-trigger"
          aria-label={label}
          aria-describedby={`${id}-value`}
          data-empty={!value}
          disabled={disabled}
        >
          <span id={`${id}-value`}>
            {value ? shortDate(value, lang) : t.chooseDate}
          </span>
          <CalendarDays size={16} aria-hidden />
        </button>
      }
    >
      <DateCalendar
        id={`${id}-calendar`}
        selected={value}
        lang={lang}
        onChoose={choose}
      />
    </Modal>
  );
}
function DateCalendar({
  id,
  selected,
  lang,
  onChoose,
}: {
  id: string;
  selected: string;
  lang: Lang;
  onChoose: (value: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10),
    initial = selected || today,
    initialDate = new Date(initial + "T12:00:00Z"),
    t = translations[lang].dateTime;
  const [yearText, setYearText] = useState(
      String(initialDate.getUTCFullYear()),
    ),
    [month, setMonth] = useState(initialDate.getUTCMonth()),
    [focused, setFocused] = useState(initial);
  const active = useRef<HTMLButtonElement>(null),
    focusRequested = useRef(false);
  const year = Number(yearText),
    validYear = /^\d{1,4}$/.test(yearText) && year >= 1 && year <= 9999;
  const first = validYear ? utcDate(year, month, 1) : initialDate;
  const count = validYear ? utcDate(year, month + 1, 0).getUTCDate() : 0,
    offset = (first.getUTCDay() + 6) % 7;
  const focusKey =
    validYear &&
    focused.slice(0, 7) === `${String(year).padStart(4, "0")}-${pad(month + 1)}`
      ? focused
      : validYear
        ? key(first)
        : "";
  const months = allMonths[lang];
  useLayoutEffect(() => {
    if (focusRequested.current) {
      focusRequested.current = false;
      active.current?.focus();
    }
  }, [focused]);
  function moveMonth(delta: number) {
    const next = utcDate(year, month + delta, 1);
    if (next.getUTCFullYear() < 1 || next.getUTCFullYear() > 9999) return;
    setYearText(String(next.getUTCFullYear()));
    setMonth(next.getUTCMonth());
  }
  function navigate(event: KeyboardEvent<HTMLButtonElement>, day: Date) {
    let next = new Date(day),
      offset = 0;
    if (event.key === "ArrowRight") offset = lang === "ar" ? -1 : 1;
    else if (event.key === "ArrowLeft") offset = lang === "ar" ? 1 : -1;
    else if (event.key === "ArrowDown") offset = 7;
    else if (event.key === "ArrowUp") offset = -7;
    else if (event.key === "Home") offset = -((day.getUTCDay() + 6) % 7);
    else if (event.key === "End") offset = 6 - ((day.getUTCDay() + 6) % 7);
    else if (event.key === "PageDown" || event.key === "PageUp") {
      next = utcDate(
        day.getUTCFullYear(),
        day.getUTCMonth() + (event.key === "PageDown" ? 1 : -1),
        1,
      );
      next.setUTCDate(
        Math.min(
          day.getUTCDate(),
          utcDate(
            next.getUTCFullYear(),
            next.getUTCMonth() + 1,
            0,
          ).getUTCDate(),
        ),
      );
    } else return;
    event.preventDefault();
    next.setUTCDate(next.getUTCDate() + offset);
    if (next.getUTCFullYear() < 1 || next.getUTCFullYear() > 9999) return;
    focusRequested.current = true;
    setYearText(String(next.getUTCFullYear()));
    setMonth(next.getUTCMonth());
    setFocused(key(next));
  }
  return (
    <div className="ui-picker-body">
      <div className="ui-date-navigation">
        <IconButton
          label={t.previousMonth}
          disabled={!validYear || (year === 1 && month === 0)}
          onClick={() => moveMonth(-1)}
        >
          <ChevronLeft size={15} className="directional" aria-hidden />
        </IconButton>
        <div>
          <Label htmlFor={`${id}-month`} className="ui-sr-only">
            {t.month}
          </Label>
          <SelectField
            id={`${id}-month`}
            value={String(month)}
            onValueChange={(value) => setMonth(Number(value))}
            options={months}
            direction={lang === "ar" ? "rtl" : "ltr"}
            placeholder={t.month}
          />
        </div>
        <div>
          <Label htmlFor={`${id}-year`} className="ui-sr-only">
            {t.year}
          </Label>
          <input
            id={`${id}-year`}
            className="ui-input ui-date-year"
            type="number"
            inputMode="numeric"
            min="1"
            max="9999"
            value={yearText}
            onChange={(event) => setYearText(event.target.value)}
            onBlur={() => {
              if (!validYear) setYearText(String(initialDate.getUTCFullYear()));
            }}
            aria-invalid={!validYear}
          />
        </div>
        <IconButton
          label={t.nextMonth}
          disabled={!validYear || (year === 9999 && month === 11)}
          onClick={() => moveMonth(1)}
        >
          <ChevronRight size={15} className="directional" aria-hidden />
        </IconButton>
      </div>
      {!validYear && (
        <p className="error" role="alert">
          {t.invalidYear}
        </p>
      )}
      <div id={id} role="grid" className="ui-date-grid" aria-label={t.calendar}>
        <div role="row" className="ui-date-row">
          {Array.from({ length: 7 }, (_, index) => {
            const day = utcDate(2026, 10, 16 + index);
            return (
              <span
                role="columnheader"
                key={index}
                aria-label={calendarFormats[lang].weekday.format(day)}
              >
                {calendarFormats[lang].narrow.format(day)}
              </span>
            );
          })}
        </div>
        {validYear &&
          Array.from({ length: Math.ceil((offset + count) / 7) }, (_, row) => (
            <div role="row" className="ui-date-row" key={row}>
              {Array.from({ length: 7 }, (_, column) => {
                const number = row * 7 + column - offset + 1;
                if (number < 1 || number > count)
                  return (
                    <span role="gridcell" aria-disabled="true" key={column} />
                  );
                const day = utcDate(year, month, number),
                  value = key(day);
                return (
                  <button
                    key={column}
                    ref={value === focusKey ? active : undefined}
                    role="gridcell"
                    type="button"
                    className="ui-date-day"
                    data-date={value}
                    aria-label={dateLabel(value, lang)}
                    aria-selected={selected === value}
                    aria-current={today === value ? "date" : undefined}
                    tabIndex={value === focusKey ? 0 : -1}
                    onFocus={() => setFocused(value)}
                    onKeyDown={(event) => navigate(event, day)}
                    onClick={() => onChoose(value)}
                  >
                    <bdi>{number}</bdi>
                  </button>
                );
              })}
            </div>
          ))}
      </div>
    </div>
  );
}
const hours = Array.from({ length: 24 }, (_, value) => ({
  value: pad(value),
  label: pad(value),
}));
const minutes = Array.from({ length: 60 }, (_, value) => ({
  value: pad(value),
  label: pad(value),
}));
export function TimeField({
  id,
  label,
  value,
  onValueChange,
  lang,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState(value || "09:00"),
    t = translations[lang].dateTime;
  return (
    <Modal
      size="compact"
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(value || "09:00");
        setOpen(next);
      }}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        document.getElementById(`${id}-hours`)?.focus();
      }}
      title={label}
      description={t.clock24}
      close={t.close}
      direction={lang === "ar" ? "rtl" : "ltr"}
      headerIcon={<Clock3 size={18} aria-hidden />}
      footer={
        <div className="ui-picker-footer">
          <button
            type="button"
            className="ui-button"
            onClick={() => setOpen(false)}
          >
            {t.cancel}
          </button>
          <button
            type="button"
            className="primary action"
            onClick={() => {
              onValueChange(draft);
              setOpen(false);
            }}
          >
            <Check size={15} aria-hidden />
            {t.applyTime}
          </button>
        </div>
      }
      trigger={
        <button
          id={id}
          type="button"
          value={value}
          className="ui-input ui-picker-trigger"
          aria-label={label}
          aria-describedby={`${id}-value`}
          data-empty={!value}
          disabled={disabled}
        >
          <span id={`${id}-value`}>
            {value ? <bdi dir="ltr">{value}</bdi> : t.chooseTime}
          </span>
          <Clock3 size={16} aria-hidden />
        </button>
      }
    >
      <TimeControls id={id} draft={draft} onChange={setDraft} lang={lang} />
    </Modal>
  );
}

function TimeControls({
  id: hourId,
  draft,
  onChange,
  lang,
}: {
  id: string;
  draft: string;
  onChange: (value: string) => void;
  lang: Lang;
}) {
  const t = translations[lang].dateTime;
  return (
    <div className="ui-picker-body">
      <p className="ui-time-preview">
        <bdi dir="ltr">{draft}</bdi>
        <small>{t.clock24}</small>
      </p>
      <div className="ui-time-selectors" dir="ltr">
        <div className="field">
          <Label htmlFor={`${hourId}-hours`}>{t.hours}</Label>
          <SelectField
            id={`${hourId}-hours`}
            value={draft.slice(0, 2)}
            onValueChange={(hour) => onChange(`${hour}:${draft.slice(3)}`)}
            options={hours}
            direction="ltr"
            placeholder={t.hours}
          />
        </div>
        <span className="ui-time-separator" aria-hidden>
          :
        </span>
        <div className="field">
          <Label htmlFor={`${hourId}-minutes`}>{t.minutes}</Label>
          <SelectField
            id={`${hourId}-minutes`}
            value={draft.slice(3)}
            onValueChange={(minute) =>
              onChange(`${draft.slice(0, 2)}:${minute}`)
            }
            options={minutes}
            direction="ltr"
            placeholder={t.minutes}
          />
        </div>
      </div>
    </div>
  );
}
