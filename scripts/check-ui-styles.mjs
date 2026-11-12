import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, relative, join } from "node:path";
const root = resolve(process.argv[2] || ".");
const errors = [];
const shared =
  /\.(ui-button|icon-btn|primary|action|icon|input-shell|ui-input|ui-textarea|ui-select(?:-content|-item|-scroll)?|ui-tooltip|draft-dialog(?:-overlay|-actions)?|ui-checkbox)(?![\w-])/;
function files(folder) {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(folder, entry.name))
      : entry.name.endsWith(".css")
        ? [join(folder, entry.name)]
        : [],
  );
}
function rules(source, visit) {
  source = source.replace(/\/\*[\s\S]*?\*\//g, "");
  let start = 0,
    depth = 0,
    opening = 0;
  for (let index = 0; index < source.length; index++) {
    if (source[index] === "{") {
      if (!depth) opening = index;
      depth++;
    } else if (source[index] === "}") {
      depth--;
      if (!depth) {
        const selector = source.slice(start, opening).trim(),
          body = source.slice(opening + 1, index);
        if (
          selector.startsWith("@media") ||
          selector.startsWith("@supports") ||
          selector.startsWith("@layer")
        )
          rules(body, visit);
        else visit(selector, body);
        start = index + 1;
      }
    }
  }
}
for (const file of files(join(root, "client"))) {
  const name = relative(root, file).replaceAll("\\", "/");
  const source = readFileSync(file, "utf8");
  if (name === "client/app/styles.css") {
    if (source.replace(/\/\*[\s\S]*?\*\//g, "").includes("{"))
      errors.push(`${name}: composition entry must contain imports only`);
    continue;
  }
  rules(source, (selector, body) => {
    if (shared.test(selector) && !name.startsWith("client/ui/"))
      errors.push(`${name}: shared component override: ${selector}`);
    if (
      /--(?:control-h|icon-btn|btn-h(?:-sm|-lg)?|dur(?:-fast|-slow)?|z-(?:overlay|dialog|popover|tooltip))\s*:/.test(
        body,
      )
    )
      errors.push(
        `${name}: shared token definition belongs in design-tokens.css`,
      );
    if (selector.startsWith("@keyframes") && name !== "client/ui/motion.css")
      errors.push(
        `${name}: animation definition belongs in client/ui/motion.css`,
      );
  });
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log("UI style ownership verified. Reference: docs/ui-components.md");
