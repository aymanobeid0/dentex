const { readdirSync } = require("node:fs");
const features = readdirSync("client/features", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
module.exports = {
  forbidden: [
    { name: "no-cycles", severity: "error", from: {}, to: { circular: true } },
    {
      name: "no-unresolved",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "foundation-has-no-domain",
      severity: "error",
      from: { path: "^client/(shared|ui)/" },
      to: { path: "^client/(app|features)/" },
    },
    {
      name: "features-have-no-app",
      severity: "error",
      from: { path: "^client/features/" },
      to: { path: "^client/app/" },
    },
    ...features.flatMap((name) => [
      {
        name: `isolated-feature-${name}`,
        severity: "error",
        from: { path: `^client/features/${name}/` },
        to: { path: "^client/features/", pathNot: `^client/features/${name}/` },
      },
      {
        name: `public-interface-only-${name}`,
        severity: "error",
        from: { path: "^client/", pathNot: `^client/features/${name}/` },
        to: {
          path: `^client/features/${name}/`,
          pathNot: `^client/features/${name}/index\\.ts$`,
        },
      },
    ]),
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".json", ".css"],
    },
  },
};
