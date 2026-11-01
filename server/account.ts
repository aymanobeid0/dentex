import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { hashPassword, verifyPassword } from './password';

export function accountRouter(prisma:PrismaClient) {
  const router=Router();
  router.post('/account/password',async(req,res)=>{
    if(res.locals.identity.kind!=='clinic') return res.status(403).json({error:'forbidden'});
    const {currentPassword,newPassword}=req.body||{};
    if(typeof currentPassword!=='string'||currentPassword.length>1024||typeof newPassword!=='string'||!newPassword.trim()||newPassword.length>1024) return res.status(400).json({error:'invalid_input'});
    const user=await prisma.user.findFirst({where:{id:res.locals.userId,clinicId:res.locals.clinicId,active:true,credentialVersion:res.locals.credentialVersion}});
    if(!user) return res.status(401).json({error:'unauthorized'});
    if(!await verifyPassword(currentPassword,user.passwordHash)) return res.status(400).json({error:'incorrect_password'});
    const passwordHash=await hashPassword(newPassword);
    const changed=await prisma.user.updateMany({where:{id:user.id,clinicId:user.clinicId,active:true,credentialVersion:user.credentialVersion},data:{passwordHash,credentialVersion:{increment:1}}});
    if(changed.count!==1) return res.status(401).json({error:'unauthorized'});
    return res.status(204).end();
  });
  return router;
}
