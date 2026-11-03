import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import type { TransactionManager } from '../shared/transaction-manager';

/** Binding is supplied by the composition root; callbacks never receive Prisma. */
export function createTransactionManager<Scope, Context = undefined>(
  database: PrismaClient,
  bind: (transaction: Prisma.TransactionClient, context?: Context) => Scope | Promise<Scope>,
): TransactionManager<Scope, Context> {
  return {
    run: (operation, context) => database.$transaction(async transaction => operation(await bind(transaction, context))),
  };
}
