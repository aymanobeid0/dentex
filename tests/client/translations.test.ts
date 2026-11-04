import { expect, it } from "vitest";
import ar from "../../client/shared/i18n/ar.json";
import fr from "../../client/shared/i18n/fr.json";

function keys(value: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(value)
    .flatMap(([key, entry]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof entry === "string") return [path];
      if (entry && typeof entry === "object" && !Array.isArray(entry))
        return keys(entry as Record<string, unknown>, path);
      throw Error(`Translation ${path} must be a string or namespace`);
    })
    .sort();
}

it("provides the same translation keys in Arabic and French", () => {
  const arabicKeys = keys(ar);
  expect(arabicKeys.length).toBeGreaterThan(0);
  expect(keys(fr)).toEqual(arabicKeys);
});
