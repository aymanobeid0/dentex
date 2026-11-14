import 'dotenv/config';
import {Client} from 'pg';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const url=new URL(process.env.DATABASE_URL);
if(url.hostname!=='127.0.0.1'||url.port!=='55460'||url.pathname!=='/dentex_dev')throw Error('Expected preserved development database');
const [mode,label]=process.argv.slice(2);
if(!['before','after'].includes(mode)||!/^treatment0[12]$/.test(label))throw Error('Expected before/after treatment01/02');
const dir=join(tmpdir(),'dentex-treatment-preservation');await mkdir(dir,{recursive:true});
const path=join(dir,`${label}.json`),db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();
try{
  if(mode==='before'){
    const dump=spawnSync('docker',['exec','dentex-database-1','pg_dump','-U',decodeURIComponent(url.username),'-d','dentex_dev','-Fc'],{maxBuffer:64*1024*1024,windowsHide:true});
    if(dump.status!==0||!dump.stdout?.subarray(0,5).equals(Buffer.from('PGDMP')))throw Error('Development backup failed');
    await writeFile(join(dir,`${label}.dump`),dump.stdout);
    const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations' ORDER BY tablename")).rows.map(x=>x.tablename);
    const snapshot={};
    for(const table of tables){
      if(!/^[a-z_]+$/.test(table))throw Error('Unexpected table');
      const rows=(await db.query(`SELECT row_to_json(t) AS row FROM "${table}" t`)).rows.map(x=>x.row);
      const columns=(await db.query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position',['public',table])).rows.map(x=>x.column_name);
      snapshot[table]={columns,rows:rows.map(x=>JSON.stringify(x)).sort()};
    }
    await writeFile(path,JSON.stringify(snapshot));console.log(`Backup valid; snapshot of ${tables.length} existing tables captured.`);
  }else{
    const snapshot=JSON.parse(await readFile(path,'utf8'));
    for(const [table,{columns,rows}] of Object.entries(snapshot)){
      const fields=columns.map(x=>`"${x}"`).join(',');
      const actual=(await db.query(`SELECT row_to_json(t) AS row FROM (SELECT ${fields} FROM "${table}") t`)).rows.map(x=>JSON.stringify(x.row)).sort();
      if(JSON.stringify(rows)!==JSON.stringify(actual))throw Error(`Preservation mismatch: ${table}`);
    }
    console.log(`Preserved every row and original column in ${Object.keys(snapshot).length} tables; no account/grant/user data changed.`);
  }
}finally{await db.end();}
