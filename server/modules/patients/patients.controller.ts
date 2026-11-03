import type { RequestHandler } from 'express';
import { parseInput } from '../../http/validation';
import { clinicActor } from '../../http/authorization';
import { uuidSchema } from '../../shared/schemas';
import { registerPatientSchema } from './patients.schemas';
import type { PatientsService } from './patients.service';
export function createPatientsController(service: PatientsService) {
  const register: RequestHandler = async (req, res) => { res.status(201).json(await service.register(clinicActor(res), parseInput(registerPatientSchema, req.body))); };
  const get: RequestHandler = async (req, res) => { res.json(await service.get(res.locals.clinicId, parseInput(uuidSchema, req.params.id, 'not_found'))); };
  return { register, get };
}
