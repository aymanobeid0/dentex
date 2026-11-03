import type { RequestHandler } from 'express';
import type { EmployeesService } from './employees.service';
import { createEmployeeSchema, editEmployeeSchema, employeeStatusSchema, resetPasswordSchema } from './employees.schemas';
import { parseInput } from '../../http/validation';
import { clinicActor } from '../../http/authorization';
import { uuidSchema } from '../../shared/schemas';
export function createEmployeesController(service: EmployeesService) {
  const list: RequestHandler = async (_req, res) => { res.json(await service.list(res.locals.clinicId)); };
  const get: RequestHandler = async (req, res) => { res.json(await service.get(res.locals.clinicId, parseInput(uuidSchema, req.params.id, 'not_found'))); };
  const register: RequestHandler = async (req, res) => { res.status(201).json(await service.register(clinicActor(res), parseInput(createEmployeeSchema, req.body))); };
  const edit: RequestHandler = async (req, res) => {
    const id = parseInput(uuidSchema, req.params.id, 'not_found');
    res.json(await service.edit(clinicActor(res), id, parseInput(editEmployeeSchema, req.body)));
  };
  const setStatus: RequestHandler = async (req, res) => {
    const id = parseInput(uuidSchema, req.params.id, 'not_found');
    res.json(await service.setStatus(clinicActor(res), id, parseInput(employeeStatusSchema, req.body)));
  };
  const resetPassword: RequestHandler = async (req, res) => {
    const id = parseInput(uuidSchema, req.params.id, 'not_found');
    await service.resetPassword(clinicActor(res), id, parseInput(resetPasswordSchema, req.body));
    res.status(204).end();
  };
  return { list, get, register, edit, setStatus, resetPassword };
}
