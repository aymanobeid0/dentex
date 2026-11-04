import ar from "./ar.json";
import fr from "./fr.json";

type TranslationShape<Value> = {
  [Key in keyof Value]: Value[Key] extends string
    ? string
    : TranslationShape<Value[Key]>;
};

export const translations = { ar, fr } satisfies Record<
  "ar" | "fr",
  TranslationShape<typeof ar>
>;
export type Lang = keyof typeof translations;
