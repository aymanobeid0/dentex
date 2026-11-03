import type { RequestHandler } from 'express';
import type { AccountService } from './account.service';
import { changePasswordSchema } from './account.schemas';
import { parseInput } from '../../http/validation';
import { clinicActor } from '../../http/authorization';
export function createAccountController(service: AccountService) {
  const changePassword: RequestHandler = async (req, res) => {
    await service.changePassword(clinicActor(res), parseInput(changePasswordSchema, req.body));
    res.status(204).end();
  };
  return { changePassword };
}
