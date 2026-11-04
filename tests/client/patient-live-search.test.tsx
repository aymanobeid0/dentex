import { renderPatient as render } from "./render-patient";
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { PatientList } from "../../client/features/patients/components/PatientList";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const empty = () => ({
  ok: true,
  status: 200,
  json: async () => ({ items: [], page: 1, hasNext: false }),
});
const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const listed = (name: string) => ({
  ok: true,
  status: 200,
  json: async () => ({
    items: [
      {
        id: name,
        name,
        fileNumber: "42",
        phone: "+22262112233",
        isChild: false,
      },
    ],
    page: 1,
    hasNext: false,
  }),
});

it("waits 300ms after the last character and updates the table without submitting", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockImplementation(async () => empty());
  vi.stubGlobal("fetch", fetcher);
  render(<PatientList lang="fr" onExpired={() => {}} />);
  await act(async () => {});
  const input = screen.getByRole("searchbox");
  fireEvent.change(input, { target: { value: "M" } });
  await advance(299);
  expect(fetcher).toHaveBeenCalledTimes(1);
  fireEvent.change(input, { target: { value: "Marie" } });
  await advance(299);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await advance(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1][0]).toBe("/api/clinic/patients?q=Marie&page=1");
});
it.each([200, 500])(
  "cancels old requests immediately and ignores a late response before the new debounce completes (%s)",
  async (status) => {
    vi.useFakeTimers();
    let finish!: (value: object) => void;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(empty())
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(listed("Latest patient"));
    vi.stubGlobal("fetch", fetcher);
    render(<PatientList lang="fr" onExpired={() => {}} />);
    await act(async () => {});
    const input = screen.getByRole("searchbox");
    input.focus();
    fireEvent.change(input, { target: { value: "Old" } });
    await advance(300);
    const oldSignal = fetcher.mock.calls[1][1].signal as AbortSignal;
    expect((input as HTMLInputElement).disabled).toBe(false);
    fireEvent.change(input, { target: { value: "Latest" } });
    expect(oldSignal.aborted).toBe(true);
    await act(async () => {
      finish(status === 200 ? listed("Old patient") : { ok: false, status });
    });
    expect(screen.queryByText("Old patient")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    await advance(299);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await advance(1);
    expect(screen.getByRole("link", { name: "Latest patient" })).toBeTruthy();
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole("status").textContent).toContain("1");
  },
);
it("ignores a response whose JSON finishes after the query changes", async () => {
  vi.useFakeTimers();
  let finishJson!: (value: object) => void;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(empty())
    .mockResolvedValueOnce({
      ok: true,
      json: () =>
        new Promise((resolve) => {
          finishJson = resolve;
        }),
    })
    .mockResolvedValue(listed("New result"));
  vi.stubGlobal("fetch", fetcher);
  render(<PatientList lang="ar" onExpired={() => {}} />);
  await act(async () => {});
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Old" } });
  await advance(300);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "New" } });
  await advance(300);
  await act(async () => {
    finishJson({
      items: [{ id: "old", name: "Wrong old result" }],
      page: 1,
      hasNext: false,
    });
  });
  expect(screen.queryByText("Wrong old result")).toBeNull();
  expect(screen.getByRole("link", { name: "New result" })).toBeTruthy();
});
it("submits immediately with Enter and does not send the scheduled request again", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockImplementation(async () => empty());
  vi.stubGlobal("fetch", fetcher);
  render(<PatientList lang="fr" onExpired={() => {}} />);
  await act(async () => {});
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "Marie" },
  });
  fireEvent.submit(screen.getByRole("search"));
  await act(async () => {});
  expect(fetcher).toHaveBeenCalledTimes(2);
  await advance(1000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "Marie  " },
  });
  await advance(400);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("waits for composition to finish and clears the query immediately", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockImplementation(async () => empty());
  vi.stubGlobal("fetch", fetcher);
  render(<PatientList lang="ar" onExpired={() => {}} />);
  await act(async () => {});
  const input = screen.getByRole("searchbox");
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: "مريم" } });
  await advance(1000);
  expect(fetcher).toHaveBeenCalledTimes(1);
  fireEvent.compositionEnd(input);
  await advance(299);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await advance(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "مسح البحث" }));
  await act(async () => {});
  expect(fetcher.mock.calls[2][0]).toBe("/api/clinic/patients?q=&page=1");
  expect((input as HTMLInputElement).value).toBe("");
});
it("cleans up the debounce and in-flight request when the list unmounts", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockImplementation(() => new Promise(() => {}));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<PatientList lang="fr" onExpired={() => {}} />);
  const signal = fetcher.mock.calls[0][1].signal as AbortSignal;
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "Marie" },
  });
  view.unmount();
  await advance(1000);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(signal.aborted).toBe(true);
});
