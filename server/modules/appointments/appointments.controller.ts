import type { RequestHandler } from "express";
import { clinicActor } from "../../http/authorization";
import { parseInput } from "../../http/validation";
import { bookAppointmentSchema } from "./appointments.schemas";
import type { AppointmentsService } from "./appointments.service";
export function createAppointmentsController(service: AppointmentsService) {
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
  return { doctors, book };
}
