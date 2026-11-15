// @vitest-environment jsdom
import "./ui-browser-apis";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPatient } from "./render-patient";
import { PatientTreatmentPlans } from "../../client/features/visits/PatientTreatmentPlans";
import { TreatmentEditor } from "../../client/features/visits/TreatmentEditor";
import { VisitTreatments } from "../../client/features/visits/VisitTreatments";
import { procedureCopy } from "../../client/features/visits/procedures.copy";
import { treatmentCopy } from "../../client/features/visits/treatments.copy";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it.each(["ar", "fr"] as const)(
  "creates a plan through a confirmed HTTP response in %s",
  async (lang) => {
    const ar = lang === "ar";
    let plans: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, options?: RequestInit) => {
        if (options?.method === "POST") {
          const body = JSON.parse(options.body as string);
          const row = {
            ...body,
            patientId: "p",
            status: "active",
            editVersion: 1,
            createdAt: new Date().toISOString(),
            items: [],
            history: [],
          };
          plans = [row];
          return new Response(JSON.stringify(row), { status: 201 });
        }
        return new Response(JSON.stringify({ items: plans }));
      }),
    );
    renderPatient(
      <PatientTreatmentPlans
        patient={{ id: "p", name: "Patient", fileNumber: "1", archived: false }}
        lang={lang}
        canTreat
        onExpired={() => {}}
      />,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: ar ? "خطة جديدة" : "Nouveau plan",
      }),
    );
    await user.type(
      screen.getByRole("textbox", { name: ar ? "اسم الخطة" : "Nom du plan" }),
      "Restoration",
    );
    await user.click(
      screen.getByRole("button", { name: ar ? "حفظ" : "Enregistrer" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Restoration" }),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  },
);
it("retains an uncertain draft and requires a successful server review before closing it", async () => {
  let failReview = true,
    posts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        posts++;
        throw new TypeError("lost reply");
      }
      return new Response(
        JSON.stringify(failReview ? { error: "server_error" } : { items: [] }),
        { status: failReview ? 500 : 200 },
      );
    }),
  );
  const close = vi.fn(),
    user = userEvent.setup();
  renderPatient(
    <TreatmentEditor
      choice={{ kind: "plan" }}
      patientId="p"
      lang="fr"
      onClose={close}
      onExpired={() => {}}
    />,
  );
  await user.type(
    screen.getByRole("textbox", { name: "Nom du plan" }),
    "Draft",
  );
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));
  expect(
    await screen.findByText(/Résultat de l’enregistrement incertain/),
  ).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Fermer" }));
  expect(close).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Vérifier les données du serveur" }),
  );
  expect(
    await screen.findByText("Impossible de charger les données."),
  ).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Fermer" }));
  expect(close).not.toHaveBeenCalled();
  failReview = false;
  await user.click(
    screen.getByRole("button", { name: "Vérifier les données du serveur" }),
  );
  await screen.findByRole("region", {
    name: "Vérifier les données du serveur",
  });
  await user.click(screen.getByRole("button", { name: "Fermer" }));
  await user.click(
    screen.getByRole("button", { name: "Abandonner et quitter" }),
  );
  expect(close).toHaveBeenCalledOnce();
  expect(posts).toBe(1);
});
it("uses the confirmed visit version for successive procedures even if refreshing fails", async () => {
  const t = treatmentCopy.fr,
    p = procedureCopy.fr,
    user = userEvent.setup(),
    versions: number[] = [],
    records: object[] = [];
  const at = "2026-11-14T10:00:00.000Z";
  const snapshot = () => ({
    patientId: "patient",
    visitId: "visit",
    visitVersion: 1 + records.length,
    visitStatus: "in_progress",
    canRecord: true,
    plans: [],
    items: records,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        const input = JSON.parse(options.body as string);
        versions.push(input.visitVersion);
        records.push({
          id: input.id,
          patientId: "patient",
          visitId: "visit",
          itemId: null,
          description: input.description,
          location: input.location,
          notes: input.notes,
          actorId: "dentist",
          actorName: "Dentist",
          recordedAt: at,
          editVersion: 1,
          voidedAt: null,
          voidActorId: null,
          voidReason: null,
          visit: {
            id: "visit",
            attendanceId: "attendance",
            doctorId: "dentist",
            doctorName: "Dentist",
            startedAt: at,
            status: "in_progress",
          },
        });
        return new Response(JSON.stringify(snapshot()), { status: 201 });
      }
      return new Response(
        JSON.stringify(records.length ? { error: "server_error" } : snapshot()),
        { status: records.length ? 500 : 200 },
      );
    }),
  );
  renderPatient(
    <VisitTreatments
      attendanceId="attendance"
      lang="fr"
      onExpired={() => {}}
    />,
  );
  await user.click(screen.getByRole("button", { name: p.title }));
  for (const name of ["Scaling", "Polishing"]) {
    await user.click(await screen.findByRole("button", { name: p.record }));
    await user.type(screen.getByRole("textbox", { name: p.performed }), name);
    await user.click(screen.getByRole("button", { name: t.save }));
    await screen.findByText(name);
  }
  expect(versions).toEqual([1, 2]);
});
it("uses confirmed plan versions for successive item additions while refresh fails",async()=>{
  const t=treatmentCopy.fr,user=userEvent.setup(),versions:number[]=[];
  const plan={id:"plan",patientId:"p",title:"Restoration",notes:"",status:"active",editVersion:1,createdAt:"2026-11-14T10:00:00.000Z",items:[] as object[],history:[]};
  let writes=0;
  vi.stubGlobal("fetch",vi.fn(async(_url:string,options?:RequestInit)=>{
    if(options?.method==="POST"){
      const input=JSON.parse(options.body as string);versions.push(input.editVersion);writes++;
      plan.items.push({...input,planId:"plan",patientId:"p",status:"pending",editVersion:1});plan.editVersion++;
      return new Response(JSON.stringify(plan),{status:201});
    }
    return new Response(JSON.stringify(writes?{error:"server_error"}:{items:[plan]}),{status:writes?500:200});
  }));
  renderPatient(<PatientTreatmentPlans patient={{id:"p",name:"Patient",fileNumber:"1",archived:false}} lang="fr" canTreat onExpired={()=>{}}/>);
  for(const name of ["First","Second"]){await user.click(await screen.findByRole("button",{name:t.addItem}));const input=screen.getByRole("textbox",{name:t.description});expect((input as HTMLInputElement).value).toBe("");await user.type(input,name);await user.click(screen.getByRole("button",{name:t.save}));await screen.findByText(name);}
  expect(versions).toEqual([1,2]);
});
