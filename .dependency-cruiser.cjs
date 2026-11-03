const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const root = 'server/modules';
let modules = [];
try { modules = readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
module.exports = {
  forbidden: [
    { name: 'no-cycles', severity: 'error', from: {}, to: { circular: true } },
    { name: 'no-unresolved', severity: 'error', from: {}, to: { couldNotResolve: true } },
    { name: 'business-has-no-http', severity: 'error', from: { path: '\\.(service|dto|schemas|errors)\\.ts$' }, to: { path: '(^node_modules/express|^server/http/|\\.(routes|controller)\\.ts$)' } },
    ...modules.map(name => ({
      name: `public-interface-only-${name}`, severity: 'error',
      from: { path: '^server/modules/', pathNot: `^${join(root, name).replaceAll('\\', '/')}/` },
      to: { path: `^${root}/${name}/`, pathNot: `^${root}/${name}/index\\.ts$` },
    })),
  ],
  options: { doNotFollow: { path: 'node_modules|generated' }, tsPreCompilationDeps: true, tsConfig: { fileName: 'tsconfig.json' }, enhancedResolveOptions: { extensions: ['.ts', '.js', '.json'] } },
};
