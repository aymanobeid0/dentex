import { isIP } from 'node:net';
import type { Application } from 'express';

/** Trust only explicitly named proxy addresses or networks, never all peers or hop counts. */
export function configureTrustedProxies(app:Application, value:string|undefined) {
  if (!value?.trim()) { app.set('trust proxy', false); return; }
  const entries=value.split(',').map(item=>item.trim());
  for (const entry of entries) {
    const parts=entry.split('/');
    const family=isIP(parts[0]);
    if (!family || parts.length>2 || (parts.length===2 && (!/^\d+$/.test(parts[1]) || Number(parts[1])<1 || Number(parts[1])>(family===4?32:128)))) throw new Error('TRUST_PROXY must list specific IP addresses or CIDR ranges');
  }
  app.set('trust proxy', entries);
}
