import type { RequestHandler } from "express";
import { clinicActor } from "../../http/authorization";
import { parseInput } from "../../http/validation";
import { uuidSchema } from "../../shared/schemas";
import {
  arriveSchema,
  editAttendanceSchema,
  attendancePatientsSchema,
} from "./visits.schemas";
import type { VisitsService } from "./visits.service";
export function createVisitsController(service: VisitsService) {
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
  return { list, get, arrive, edit, doctors, patients };
}
