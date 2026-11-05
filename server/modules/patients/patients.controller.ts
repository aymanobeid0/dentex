import type { RequestHandler } from 'express';
import { parseInput } from '../../http/validation';
import { clinicActor } from '../../http/authorization';
import { uuidSchema } from '../../shared/schemas';
import { archivePatientSchema, editPatientSchema, listPatientsSchema, registerPatientSchema, oldFileNumberSchema } from './patients.schemas';
import type { PatientsService } from './patients.service';
export function createPatientsController(service: PatientsService) {
  const list: RequestHandler = async (req, res) => { res.json(await service.list(res.locals.clinicId, parseInput(listPatientsSchema, req.query))); };
  const register: RequestHandler = async (req, res) => { res.status(201).json(await service.register(clinicActor(res), parseInput(registerPatientSchema, req.body))); };
  const get: RequestHandler = async (req, res) => { res.json(await service.get(res.locals.clinicId, parseInput(uuidSchema, req.params.id, 'not_found'))); };
  const edit: RequestHandler = async (req, res) => { res.json(await service.edit(clinicActor(res), parseInput(uuidSchema, req.params.id, 'not_found'), parseInput(editPatientSchema, req.body))); };
  const archive: RequestHandler = async (req, res) => { res.json(await service.archive(clinicActor(res), parseInput(uuidSchema, req.params.id, 'not_found'), parseInput(archivePatientSchema, req.body))); };
  const lookupOldNumber: RequestHandler = async (req, res) => { res.json(await service.lookupOldNumber(clinicActor(res), parseInput(oldFileNumberSchema, req.params.oldFileNumber))); };
  return { register, get, list, edit, archive, lookupOldNumber };
}
