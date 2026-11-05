import { z } from 'zod';

const normalizeDigits = (value: string) => value
  .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660))
  .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0));
const phone = z.string().max(80).transform(value => normalizeDigits(value).replace(/[\s-]/g, ''))
  .transform(value => value.startsWith('00222') ? `+222${value.slice(5)}` : /^\d{8}$/.test(value) ? `+222${value}` : value)
  .pipe(z.string().regex(/^\+222\d{8}$/));
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional().transform(value => value || null);
const birthDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value && value <= new Date().toISOString().slice(0, 10) && value >= '0001-01-01';
}).nullable().optional().transform(value => value ?? null);
export const registerPatientSchema = z.strictObject({
  name: z.string().trim().min(1).max(200), phone, gender: z.enum(['male', 'female']),
  isChild: z.boolean().default(false), birthDate, address: optionalText(500), administrativeNote: optionalText(2000),
});
export type RegisterPatientInput = z.infer<typeof registerPatientSchema>;
export const editPatientSchema = registerPatientSchema.extend({ editVersion: z.number().int().min(1).max(2147483646) });
export type EditPatientInput = z.infer<typeof editPatientSchema>;
export const listPatientsSchema = z.strictObject({
  q: z.string().trim().max(200).default(''),
  page: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(1000000)).default(1),
}).transform(input => {
  const parsedPhone = phone.safeParse(input.q);
  const digits = normalizeDigits(input.q);
  const number = /^\d+$/.test(digits) ? BigInt(digits) : null;
  return { ...input, normalizedPhone: parsedPhone.success ? parsedPhone.data : null, fileNumber: number !== null && number <= 9223372036854775807n ? number.toString() : null };
});
export type ListPatientsInput = z.infer<typeof listPatientsSchema>;
