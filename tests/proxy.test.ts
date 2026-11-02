import { describe,it,expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { configureTrustedProxies } from '../server/proxy';

describe('reverse proxy trust',()=>{
  it('ignores forwarded addresses unless a trusted peer is configured',async()=>{
    const app=express();configureTrustedProxies(app,undefined);app.get('/',(req,res)=>res.json({ip:req.ip}));
    const r=await request(app).get('/').set('X-Forwarded-For','198.51.100.5');expect(r.body.ip).not.toBe('198.51.100.5');
  });
  it('accepts a forwarded address only from a configured peer',async()=>{
    const app=express();configureTrustedProxies(app,'127.0.0.1,::1');app.get('/',(req,res)=>res.json({ip:req.ip}));
    const r=await request(app).get('/').set('X-Forwarded-For','198.51.100.5');expect(r.body.ip).toBe('198.51.100.5');
    const other=express();configureTrustedProxies(other,'192.0.2.0/24');other.get('/',(req,res)=>res.json({ip:req.ip}));
    const r2=await request(other).get('/').set('X-Forwarded-For','198.51.100.5');expect(r2.body.ip).not.toBe('198.51.100.5');
  });
  it('rejects wildcard, hop counts and malformed networks',()=>{
    for(const value of ['true','1','0.0.0.0/0','::/0','127.0.0.1/99','bad','127.0.0.1,']) expect(()=>configureTrustedProxies(express(),value)).toThrow();
  });
});
