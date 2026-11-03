import { z } from 'zod';
export const permissionKeys = ['employees.manage','patients.read','patients.write','patient_records.read','patient_records.write','dental_chart.read','dental_chart.write','appointments.read','appointments.write','prescriptions.read','prescriptions.write','communications.read','communications.write','invoices.read','invoices.write','payments.read','payments.write','patient_financial.read'] as const;
export const permissionsSchema = z.object({ permissions: z.array(z.enum(permissionKeys)).refine(keys => new Set(keys).size === keys.length) });
export type PermissionsInput = z.infer<typeof permissionsSchema>;
