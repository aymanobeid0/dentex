// Read-only maintenance evidence. Snapshots contain identifiers; keep them outside Git with restricted ACLs.
import { Client } from 'pg';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import dotenv from 'dotenv';

const [mode, evidenceFile] = process.argv.slice(2);
if (!['snapshot', 'verify-before', 'verify-after'].includes(mode) || !evidenceFile) throw Error('Expected snapshot|verify-before|verify-after and an external evidence path');
const external = relative(process.cwd(), resolve(evidenceFile));
if (!(external === '..' || external.startsWith('..' + sep) || isAbsolute(external))) throw Error('Evidence must be outside the repository');
const url = new URL(process.env.DATABASE_URL || dotenv.parse(await readFile('.env')).DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !['/dentex_dev', '/dentex_test'].includes(url.pathname)) throw Error('Only explicit local development or isolated restore database');
const client = new Client({ connectionString: url.toString() });
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
await client.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('_prisma_migrations','patients','patient_numbering','patient_number_history') ORDER BY tablename")).rows;
  const preserved = {};
  for (const { tablename } of tables) {
    const quoted = '"' + tablename.replaceAll('"', '""') + '"';
    const rows = (await client.query(`SELECT to_jsonb(t)::text AS row FROM ${quoted} t ORDER BY to_jsonb(t)::text`)).rows.map(r => r.row);
    preserved[tablename] = { count: rows.length, hash: hash(rows) };
  }
  const patients = (await client.query("SELECT id, clinic_id, file_number::text AS file_number, (to_jsonb(p)-'file_number')::text AS fields FROM patients p ORDER BY p.clinic_id,p.file_number")).rows;
  const numbers = new Map();
  const records = patients.map(p => {
    const next = (numbers.get(p.clinic_id) || 0n) + 1n;
    numbers.set(p.clinic_id, next);
    return { id: p.id, clinicId: p.clinic_id, old: p.file_number, next: next.toString(), fieldsHash: hash(p.fields) };
  });
  const snapshot = { preserved, records };
  if (mode === 'snapshot') {
    await writeFile(evidenceFile, JSON.stringify(snapshot, null, 2), { flag: 'wx', mode: 0o600 });
  } else {
    const before = JSON.parse(await readFile(evidenceFile, 'utf8'));
    if (hash(before.preserved) !== hash(preserved)) throw Error('Non-patient tables changed');
    if (mode === 'verify-before') {
      if (hash(before.records) !== hash(records)) throw Error('Restore does not match the final snapshot');
    } else {
      const current = new Map(records.map(p => [p.id, p]));
      if (current.size !== before.records.length) throw Error('Patient count changed');
      const history = (await client.query('SELECT clinic_id,old_file_number::text,patient_id FROM patient_number_history')).rows;
      if (history.length !== before.records.length) throw Error('History count mismatch');
      const mapped = new Map(history.map(h => [h.patient_id, h]));
      const expectedCounters = new Map();
      for (const p of before.records) {
        const now = current.get(p.id), old = mapped.get(p.id);
        if (!now || now.clinicId !== p.clinicId || now.fieldsHash !== p.fieldsHash || now.old !== p.next || !old || old.clinic_id !== p.clinicId || old.old_file_number !== p.old) throw Error('Patient identity, fields or mapping mismatch');
        expectedCounters.set(p.clinicId, p.next);
      }
      const counters = (await client.query('SELECT clinic_id,start::text,last_number::text FROM patient_numbering')).rows;
      if (counters.length !== preserved.clinics.count) throw Error('Missing clinic counter');
      for (const c of counters) if (c.start !== '1' || c.last_number !== (expectedCounters.get(c.clinic_id) || '0')) throw Error('Incorrect next clinic number');
      const legacyDefault = (await client.query("SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='patients' AND column_name='file_number'")).rows[0];
      if (legacyDefault.column_default !== null) throw Error('Legacy generator remains');
    }
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({ ok: true, mode, clinics: preserved.clinics.count, patients: records.length, otherTablesVerified: Object.keys(preserved).length }));
} finally { await client.end(); }
