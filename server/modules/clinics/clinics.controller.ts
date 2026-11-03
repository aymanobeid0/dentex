import type { RequestHandler } from 'express';
import type { ClinicsService } from './clinics.service';
import { createClinicSchema, resetAdministratorSchema } from './clinics.schemas';
import { parseInput } from '../../http/validation';
import { platformActor } from '../../http/authorization';
import { uuidSchema } from '../../shared/schemas';
export function createClinicsController(service: ClinicsService) {
  const list: RequestHandler = async (_req, res) => { res.json(await service.list()); };
  const administrators: RequestHandler = async (req, res) => { res.json(await service.administrators(parseInput(uuidSchema, req.params.clinicId, 'not_found'))); };
  const register: RequestHandler = async (req, res) => { res.status(201).json(await service.register(parseInput(createClinicSchema, req.body))); };
  const resetAdministrator: RequestHandler = async (req, res) => {
    const clinicId = parseInput(uuidSchema, req.params.clinicId, 'not_found');
    const userId = parseInput(uuidSchema, req.params.userId, 'not_found');
    await service.resetAdministrator(platformActor(res), clinicId, userId, parseInput(resetAdministratorSchema, req.body));
    res.status(204).end();
  };
  return { list, administrators, register, resetAdministrator };
}
