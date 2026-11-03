/**
 * Each operation receives its own repository and the public operations of other
 * modules, all bound by the composition root to the SAME database transaction.
 * Scope must not expose another module's repository or a database client.
 */
export interface TransactionManager<Scope, Context = undefined> {
  run<Result>(operation: (scope: Scope) => Promise<Result>, context?: Context): Promise<Result>;
}
