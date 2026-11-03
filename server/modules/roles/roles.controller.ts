import type { RequestHandler } from 'express';
import type { RolesService } from './roles.service';
import { permissionsSchema } from './roles.schemas';
import { uuidSchema } from '../../shared/schemas';
import { parseInput } from '../../http/validation';
import { clinicActor } from '../../http/authorization';
export function createRolesController(service: RolesService) {
  const list: RequestHandler = async (_req, res) => { res.json(await service.list(res.locals.clinicId)); };
  const choices: RequestHandler = async (_req, res) => { res.json(await service.choices(res.locals.clinicId)); };
  const change: RequestHandler = async (req, res) => {
    const id = parseInput(uuidSchema, req.params.id, 'not_found');
    res.json(await service.change(clinicActor(res), id, parseInput(permissionsSchema, req.body, 'invalid_permissions')));
  };
  return { list, choices, change };
}
