import tseslint from 'typescript-eslint';

const storageImport = { regex: '(generated/prisma|@prisma/|(^|/)database$)', message: 'Prisma is restricted to repositories, infrastructure and application composition.' };
const httpImport = { regex: '(^express$|^express-|(^|/)http/|\\.(routes|controller)$)', message: 'Business rules must not depend on HTTP.' };
const dataCalls = {
  selector: "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(findUnique|findUniqueOrThrow|findFirst|findFirstOrThrow|findMany|create|createMany|update|updateMany|delete|deleteMany|upsert|count|aggregate|groupBy|\\$transaction|\\$queryRaw|\\$executeRaw)$/]",
  message: 'Database queries belong in repositories; transaction execution belongs in infrastructure.',
};

export default [
  {
    files: ['server/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    rules: { 'no-restricted-imports': ['error', { patterns: [storageImport] }] },
  },
  {
    files: ['server/**/*.repository.ts', 'server/infrastructure/**/*.ts', 'server/database.ts', 'server/app.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['server/**/*.ts'],
    ignores: ['server/**/*.repository.ts', 'server/infrastructure/**/*.ts', 'server/database.ts'],
    rules: { 'no-restricted-syntax': ['error', dataCalls, {
      selector: "TaggedTemplateExpression[tag.type='MemberExpression'][tag.property.name=/^\\$(queryRaw|executeRaw)/]",
      message: 'SQL and row locks belong in repositories.',
    }] },
  },
  {
    files: ['server/**/*.service.ts', 'server/**/*.dto.ts', 'server/**/*.schemas.ts', 'server/**/*.errors.ts', 'server/shared/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [storageImport, httpImport] }] },
  },
];
