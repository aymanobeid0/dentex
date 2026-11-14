import type { RequestHandler } from "express";
import { clinicActor } from "../../http/authorization";
import { parseInput } from "../../http/validation";
import { uuidSchema } from "../../shared/schemas";
import {
  deleteAttendanceSchema,
  correctionSchema,
  arriveSchema,
  editAttendanceSchema,
  attendancePatientsSchema,
  startSchema,
  completeSchema,
  historySchema,
  appointmentLinkSchema,
} from "./visits.schemas";
import type { VisitsService } from "./visits.service";
export function createVisitsController(service: VisitsService) {
  const catchUp: RequestHandler = async (_req, res, next) => {
    await service.catchUp(clinicActor(res));
    next();
  };
  const remove: RequestHandler = async (req, res) => {
    await service.remove(
      clinicActor(res),
      parseInput(uuidSchema, req.params.id, "not_found"),
      parseInput(deleteAttendanceSchema, req.body),
    );
    res.status(204).end();
  };
  const correct: RequestHandler = async (req, res) => {
    res.json(
      await service.correct(
        clinicActor(res),
        parseInput(uuidSchema, req.params.id, "not_found"),
        parseInput(correctionSchema, req.body),
      ),
    );
  };
  const appointmentOptions: RequestHandler = async (req, res) => {
    res.json(
      await service.appointmentOptions(
        clinicActor(res),
        parseInput(uuidSchema, req.params.id, "not_found"),
      ),
    );
  };
  const appointmentLink: RequestHandler = async (req, res) => {
    res.json(
      await service.appointmentLink(
        clinicActor(res),
        parseInput(uuidSchema, req.params.id, "not_found"),
        parseInput(appointmentLinkSchema, req.body),
      ),
    );
  };
  const list: RequestHandler = async (_req, res) => {
    res.json(await service.list(clinicActor(res)));
  };
  const get: RequestHandler = async (req, res) => {
    res.json(
      await service.get(
        clinicActor(res),
        parseInput(uuidSchema, req.params.id, "not_found"),
      ),
    );
  };
  const arrive: RequestHandler = async (req, res) => {
    res
      .status(201)
      .json(
        await service.arrive(
          clinicActor(res),
          parseInput(arriveSchema, req.body),
        ),
      );
  };
  const edit: RequestHandler = async (req, res) => {
    res.json(
      await service.edit(
        clinicActor(res),
        parseInput(uuidSchema, req.params.id, "not_found"),
        parseInput(editAttendanceSchema, req.body),
      ),
    );
  };
  const doctors: RequestHandler = async (_req, res) => {
    res.json(await service.doctors(clinicActor(res)));
  };
  const patients: RequestHandler = async (req, res) => {
    res.json(
      await service.patients(
        clinicActor(res),
        parseInput(attendancePatientsSchema, req.query),
      ),
    );
  };
  const start: RequestHandler = async (req, res) => {
    res.json(
      await service.start(
        clinicActor(res),
        parseInput(uuidSchema, req.params.id, "not_found"),
        parseInput(startSchema, req.body),
      ),
    );
  };
  const complete: RequestHandler = async (req, res) => {
    res.json(
      await service.complete(
        clinicActor(res),
        parseInput(uuidSchema, req.params.id, "not_found"),
        parseInput(completeSchema, req.body),
      ),
    );
  };
  const history: RequestHandler = async (req, res) => {
    res.json(
      await service.history(
        clinicActor(res),
        parseInput(uuidSchema, req.params.patientId, "not_found"),
        parseInput(historySchema, req.query).page,
      ),
    );
  };
  return {
    catchUp,
    correct,
    remove,
    appointmentOptions,
    appointmentLink,
    list,
    get,
    arrive,
    edit,
    doctors,
    patients,
    start,
    complete,
    history,
  };
}
