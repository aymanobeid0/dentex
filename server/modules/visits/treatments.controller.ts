import type { RequestHandler } from "express";
import { clinicActor } from "../../http/authorization";
import { parseInput } from "../../http/validation";
import { uuidSchema } from "../../shared/schemas";
import {
  planCreateSchema,
  planEditSchema,
  itemCreateSchema,
  itemEditSchema,
  procedureCreateSchema,
  procedureVoidSchema,
} from "./treatments.schemas";
import type { TreatmentsService } from "./treatments.service";
export function createTreatmentsController(service: TreatmentsService) {
  const procedures: RequestHandler = async (req, res) => {
    res.json(
      await service.procedures(
        clinicActor(res),
        parseInput(uuidSchema, req.params.attendanceId, "not_found"),
      ),
    );
  };
  const record: RequestHandler = async (req, res) => {
    res
      .status(201)
      .json(
        await service.record(
          clinicActor(res),
          parseInput(uuidSchema, req.params.attendanceId, "not_found"),
          parseInput(procedureCreateSchema, req.body),
        ),
      );
  };
  const voidProcedure: RequestHandler = async (req, res) => {
    res.json(
      await service.void(
        clinicActor(res),
        parseInput(uuidSchema, req.params.procedureId, "not_found"),
        parseInput(procedureVoidSchema, req.body),
      ),
    );
  };
  const list: RequestHandler = async (req, res) => {
    res.json(
      await service.list(
        clinicActor(res),
        parseInput(uuidSchema, req.params.patientId, "not_found"),
      ),
    );
  };
  const create: RequestHandler = async (req, res) => {
    res
      .status(201)
      .json(
        await service.createPlan(
          clinicActor(res),
          parseInput(uuidSchema, req.params.patientId, "not_found"),
          parseInput(planCreateSchema, req.body),
        ),
      );
  };
  const edit: RequestHandler = async (req, res) => {
    res.json(
      await service.edit(
        clinicActor(res),
        parseInput(uuidSchema, req.params.planId, "not_found"),
        parseInput(planEditSchema, req.body),
      ),
    );
  };
  const addItem: RequestHandler = async (req, res) => {
    res
      .status(201)
      .json(
        await service.addItem(
          clinicActor(res),
          parseInput(uuidSchema, req.params.planId, "not_found"),
          parseInput(itemCreateSchema, req.body),
        ),
      );
  };
  const editItem: RequestHandler = async (req, res) => {
    res.json(
      await service.editItem(
        clinicActor(res),
        parseInput(uuidSchema, req.params.itemId, "not_found"),
        parseInput(itemEditSchema, req.body),
      ),
    );
  };
  return {
    list,
    create,
    edit,
    addItem,
    editItem,
    procedures,
    record,
    voidProcedure,
  };
}
