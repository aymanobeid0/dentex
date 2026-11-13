import type { RequestHandler } from "express";
import { clinicActor } from "../../http/authorization";
import { parseInput } from "../../http/validation";
import {
  appointmentPageSchema,
  appointmentPatientsSchema,
  bookAppointmentSchema,
  listAppointmentsSchema,
  editAppointmentSchema,
} from "./appointments.schemas";
import { uuidSchema } from "../../shared/schemas";
import type { AppointmentsService } from "./appointments.service";
export function createAppointmentsController(service: AppointmentsService) {
  const edit: RequestHandler = async (req, res) => {
    res.json(
      await service.edit(
        clinicActor(res),
        parseInput(uuidSchema, req.params.id, "not_found"),
        parseInput(editAppointmentSchema, req.body),
      ),
    );
  };
  const patients: RequestHandler = async (req, res) => {
    res.json(
      await service.patients(
        clinicActor(res),
        parseInput(appointmentPatientsSchema, req.query),
      ),
    );
  };
  const list: RequestHandler = async (req, res) => {
    res.json(
      await service.list(
        clinicActor(res),
        parseInput(listAppointmentsSchema, req.query),
      ),
    );
  };
  const patient: RequestHandler = async (req, res) => {
    res.json(
      await service.patient(
        clinicActor(res),
        parseInput(uuidSchema, req.params.patientId, "not_found"),
        parseInput(appointmentPageSchema, req.query).page,
      ),
    );
  };
  const get: RequestHandler = async (req, res) => {
    res.json(
      await service.get(
        clinicActor(res),
        parseInput(uuidSchema, req.params.id, "not_found"),
      ),
    );
  };
  const doctors: RequestHandler = async (_req, res) => {
    res.json(await service.doctors(clinicActor(res)));
  };
  const book: RequestHandler = async (req, res) => {
    res
      .status(201)
      .json(
        await service.book(
          clinicActor(res),
          parseInput(bookAppointmentSchema, req.body),
        ),
      );
  };
  return { doctors, book, patients, list, patient, get, edit };
}
