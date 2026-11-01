import { Router } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';

export const permissionKeys=['employees.manage','patients.read','patients.write','patient_records.read','patient_records.write','dental_chart.read','dental_chart.write','appointments.read','appointments.write','prescriptions.read','prescriptions.write','communications.read','communications.write','invoices.read','invoices.write','payments.read','payments.write','patient_financial.read'] as const;
export const defaults:Record<'dentist'|'receptionist',string[]>={
  dentist:['patients.read','patient_records.read','patient_records.write','dental_chart.read','dental_chart.write','appointments.read','appointments.write','prescriptions.read','prescriptions.write','invoices.read','payments.read','patient_financial.read'],
  receptionist:['patients.read','patients.write','communications.read','communications.write','appointments.read','appointments.write','invoices.read','invoices.write','payments.read','payments.write','patient_financial.read']
};
export async function addDefaultPermissions(tx:Prisma.TransactionClient, roles:{id:string;key:string}[]) {
  await tx.permission.createMany({data:permissionKeys.map(key=>({key})),skipDuplicates:true});
  await tx.rolePermission.createMany({data:roles.flatMap(role=>(defaults[role.key as keyof typeof defaults]??[]).map(permissionKey=>({roleId:role.id,permissionKey}))),skipDuplicates:true});
}
export function rolePermissionsRouter(prisma:PrismaClient){
  const router=Router();
  router.use((_req,res,next)=>res.locals.identity.kind==='clinic'&&res.locals.identity.roles.includes('admin')?next():res.status(403).json({error:'forbidden'}));
  router.get('/',async(_req,res)=>{
    const roles=await prisma.role.findMany({where:{clinicId:res.locals.clinicId},include:{permissions:true},orderBy:{key:'asc'}});
    return res.json({permissions:permissionKeys,roles:roles.map(r=>({id:r.id,key:r.key,permissions:r.key==='admin'?[...permissionKeys]:r.permissions.map(p=>p.permissionKey).filter(k=>permissionKeys.includes(k as typeof permissionKeys[number])).sort()}))});
  });
  router.put('/:id',async(req,res,next)=>{
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) return res.status(404).json({error:'not_found'});
    const keys=req.body?.permissions;
    if(!Array.isArray(keys)||keys.some(k=>typeof k!=='string'||!permissionKeys.includes(k as typeof permissionKeys[number]))||new Set(keys).size!==keys.length) return res.status(400).json({error:'invalid_permissions'});
    try {
      const result=await prisma.$transaction(async tx=>{
        const clinicId:string=res.locals.clinicId;
        await tx.$queryRaw`SELECT id FROM clinics WHERE id = ${clinicId}::uuid FOR UPDATE`;
        const actor=await tx.user.findFirst({where:{id:res.locals.userId,clinicId,active:true,credentialVersion:res.locals.credentialVersion,userRoles:{some:{role:{key:'admin'}}}}});
        if(!actor) return {status:403,error:'forbidden'} as const;
        const role=await tx.role.findFirst({where:{id:req.params.id,clinicId}});
        if(!role) return {status:404,error:'not_found'} as const;
        if(role.key==='admin') return {status:403,error:'admin_locked'} as const;
        await tx.permission.createMany({data:permissionKeys.map(key=>({key})),skipDuplicates:true});
        await tx.rolePermission.deleteMany({where:{roleId:role.id}});
        await tx.rolePermission.createMany({data:keys.map(permissionKey=>({roleId:role.id,permissionKey}))});
        return {status:200,role:{id:role.id,key:role.key,permissions:[...keys].sort()}} as const;
      });
      return result.status===200?res.json(result.role):res.status(result.status).json({error:result.error});
    } catch(error){return next(error)}
  });
  return router;
}
