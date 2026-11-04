export type Account =
  | { kind: "platform"; username: string }
  | {
      kind: "clinic";
      username: string;
      name: string;
      clinic: { id: string; name: string; code: string };
      roles: string[];
      permissions: string[];
    };
