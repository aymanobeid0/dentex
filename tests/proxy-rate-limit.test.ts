import { it,expect } from 'vitest';
import request from 'supertest';
import { app } from '../server/app';
import { configureTrustedProxies } from '../server/proxy';

it('limits distinct clients independently when the trusted proxy supplies their addresses',async()=>{
  process.env.APP_ORIGIN='http://localhost:5173';configureTrustedProxies(app,'127.0.0.1,::1');
  try {
    const send=(ip:string)=>request(app).post('/api/auth/clinic/login').set('Origin',process.env.APP_ORIGIN!).set('X-Forwarded-For',ip).send({});
    for(let i=0;i<10;i++)expect((await send('198.51.100.61')).status).toBe(400);
    expect((await send('198.51.100.61')).status).toBe(429);
    expect((await send('198.51.100.62')).status).toBe(400);
  } finally {configureTrustedProxies(app,undefined)}
});
