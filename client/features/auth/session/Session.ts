import { createSessionRequest } from "../../../shared/api/request";
import { createQueryClient } from "../../../shared/query/client";
import { readIdentity } from "../api";
import type { Account } from "../types";
const identity = (account: Account | null) =>
  account
    ? JSON.stringify([
        account.kind,
        account.kind === "clinic" ? account.clinic.id : null,
        account.username,
      ])
    : "anonymous";
let nextSession = 0;
export class Session {
  readonly id = ++nextSession;
  readonly client = createQueryClient();
  readonly transport = createSessionRequest(() => this.replace(null));
  readonly key: readonly unknown[];
  private retired = false;
  private owner: string;
  constructor(
    private changed: (session: Session) => void,
    account?: Account | null,
  ) {
    this.owner = account === undefined ? "bootstrap" : identity(account);
    this.key = ["session", this.id, this.owner, "identity"];
    if (account !== undefined) this.client.setQueryData(this.key, account);
  }
  replace(account: Account | null) {
    if (this.retired) return;
    this.retired = true;
    this.transport.retire();
    void this.client.cancelQueries();
    this.client.clear();
    this.changed(new Session(this.changed, account));
  }
  async readIdentity(signal?: AbortSignal) {
    const account = await readIdentity(this.transport.request, signal);
    if (identity(account) !== this.owner) this.replace(account);
    return account;
  }
  async refresh() {
    await this.client.fetchQuery({
      queryKey: this.key,
      queryFn: ({ signal }) => this.readIdentity(signal),
    });
  }
}
