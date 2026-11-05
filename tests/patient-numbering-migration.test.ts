import { afterAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { readFile } from 'node:fs/promises';

describe.skipIf(!process.env.TEST_DATABASE_URL)('clinic numbering migration', () => {
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  afterAll(async () => { await client.end(); });
  it('preserves every field and UUID, resolves intermediate collisions, initializes empty clinics and rejects replay', async () => {
    if (new URL(process.env.TEST_DATABASE_URL!).pathname !== '/dentex_test' || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw Error('Only dentex_test');
    await client.connect();
    const schema = `numbering_${crypto.randomUUID().replaceAll('-', '')}`;
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    try {
      for (const migration of ['20261101000000_baseline', '20261103000000_patients', '20261105020000_patient_edit_version', '20261105030000_patient_archive']) {
        await client.query(await readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8'));
      }
      const clinics = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'];
      for (const [i, id] of clinics.entries()) await client.query('INSERT INTO clinics (id,name,code) VALUES ($1,$2,$3)', [id, 'Fixture clinic', `900${i}`]);
      for (const [i, number] of [2, 5, 1, 8].entries()) await client.query(`INSERT INTO patients (clinic_id,file_number,name,phone,gender,is_child,birth_date,address,administrative_note,archived,edit_version) VALUES ($1,$2,$3,'+22220112233','female',true,'2001-01-01','Address','Note',$4,7)`, [clinics[i < 2 ? 0 : 1], number, `Fixture ${i}`, i === 1]);
      const before = (await client.query('SELECT * FROM patients ORDER BY clinic_id,file_number')).rows;
      const sql = await readFile('prisma/migrations/20261105040000_clinic_patient_numbering/migration.sql', 'utf8');
      await client.query(sql);
      const after = (await client.query('SELECT * FROM patients ORDER BY clinic_id,file_number')).rows;
      expect(after.map(({ file_number, ...rest }) => rest)).toEqual(before.map(({ file_number, ...rest }) => rest));
      expect(after.map(p => p.file_number)).toEqual(['1', '2', '1', '2']);
      expect((await client.query('SELECT old_file_number,patient_id FROM patient_number_history ORDER BY clinic_id,old_file_number')).rows).toEqual(before.map(p => ({ old_file_number: p.file_number, patient_id: p.id })));
      expect((await client.query('SELECT start,last_number FROM patient_numbering ORDER BY clinic_id')).rows).toEqual([{ start: '1', last_number: '2' }, { start: '1', last_number: '2' }, { start: '1', last_number: '0' }]);
      await expect(client.query(sql)).rejects.toThrow();
      await client.query('ROLLBACK');
      expect((await client.query('SELECT * FROM patients ORDER BY clinic_id,file_number')).rows).toEqual(after);
      await expect(client.query(`INSERT INTO patients (clinic_id,name,phone,gender) VALUES ($1,'Old app','+22221112233','male')`, [clinics[0]])).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
      await client.query('SET search_path TO public');
      await client.query(`DROP SCHEMA ${schema} CASCADE`);
    }
  });
});
