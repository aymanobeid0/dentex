import { Router } from 'express';
import { Prisma, type PrismaClient } from '@prisma/client';
import { hashPassword } from './password';

const selectEmployee = { id:true, name:true, username:true, active:true, userRoles:{select:{role:{select:{id:true,key:true}}}} } as const;
const expose = (u:Prisma.UserGetPayload<{select:typeof selectEmployee}>) => ({id:u.id,name:u.name,username:u.username,active:u.active,roles:u.userRoles.map(r=>r.role).sort((a,b)=>a.key.localeCompare(b.key))});
const validText = (v:unknown, max:number):v is string => typeof v==='string' && v.trim().length>0 && v.trim().length<=max;
const uuid = (v:unknown):v is string => typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const validRoles = (v:unknown):v is string[] => Array.isArray(v) && v.length>0 && v.length<=3 && v.every(uuid) && new Set(v).size===v.length;
class EmployeeError extends Error { constructor(public status:number, public code:string){ super(code); } }

export function employeeRouter(prisma:PrismaClient) {
  const router=Router();
  router.use((_req,res,next)=>{
    const a=res.locals.identity;
    if (a.kind!=='clinic' || !(a.roles.includes('admin') || a.permissions.includes('employees.manage'))) return res.status(403).json({error:'forbidden'});
    next();
  });
  router.get('/roles',async (_req,res)=>res.json(await prisma.role.findMany({where:{clinicId:res.locals.clinicId},select:{id:true,key:true},orderBy:{key:'asc'}})));
  router.get('/employees',async (_req,res)=>res.json((await prisma.user.findMany({where:{clinicId:res.locals.clinicId},select:selectEmployee,orderBy:{name:'asc'}})).map(expose)));
  router.get('/employees/:id',async (req,res)=>{
    if(!uuid(req.params.id)) return res.status(404).json({error:'not_found'});
    const user=await prisma.user.findFirst({where:{id:req.params.id,clinicId:res.locals.clinicId},select:selectEmployee});
    return user ? res.json(expose(user)) : res.status(404).json({error:'not_found'});
  });
  async function locked<T>(res:import('express').Response, fn:(tx:Prisma.TransactionClient, clinicId:string)=>Promise<T>):Promise<T> {
    const clinicId:string=res.locals.clinicId, userId:string=res.locals.userId, version:number=res.locals.credentialVersion;
    return prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM clinics WHERE id = ${clinicId}::uuid FOR UPDATE`;
      const actor=await tx.user.findFirst({where:{id:userId,clinicId,active:true,credentialVersion:version},include:{userRoles:{include:{role:{include:{permissions:true}}}}}});
      if(!actor || !actor.userRoles.some(ur=>ur.role.key==='admin'||ur.role.permissions.some(p=>p.permissionKey==='employees.manage'))) throw new EmployeeError(403,'forbidden');
      return fn(tx,clinicId);
    });
  }
  const respondError=(err:unknown,res:import('express').Response,next:import('express').NextFunction)=>{
    if(err instanceof EmployeeError) return res.status(err.status).json({error:err.code});
    if(err instanceof Prisma.PrismaClientKnownRequestError && err.code==='P2002') return res.status(409).json({error:'duplicate_username'});
    return next(err);
  };
  router.post('/employees',async(req,res,next)=>{
    const {name,username,password,roleIds}=req.body||{};
    if(!validText(name,200)||!validText(username,200)||!validText(password,1024)||!validRoles(roleIds)) return res.status(400).json({error:'invalid_input'});
    try {
      const passwordHash=await hashPassword(password);
      const user=await locked(res,async(tx,clinicId)=>{
        if(await tx.role.count({where:{clinicId,id:{in:roleIds}}})!==roleIds.length) throw new EmployeeError(400,'invalid_roles');
        const user=await tx.user.create({data:{clinicId,name:name.trim(),username:username.trim(),passwordHash}});
        await tx.userRole.createMany({data:roleIds.map(roleId=>({clinicId,userId:user.id,roleId}))});
        return tx.user.findUniqueOrThrow({where:{id:user.id},select:selectEmployee});
      });
      return res.status(201).json(expose(user));
    } catch(err){return respondError(err,res,next)}
  });
  router.put('/employees/:id',async(req,res,next)=>{
    const {name,username,roleIds}=req.body||{};
    if(!uuid(req.params.id)) return res.status(404).json({error:'not_found'});
    if(!validText(name,200)||!validText(username,200)||!validRoles(roleIds)) return res.status(400).json({error:'invalid_input'});
    try {
      const user=await locked(res,async(tx,clinicId)=>{
        const current=await tx.user.findFirst({where:{id:req.params.id,clinicId},include:{userRoles:{include:{role:true}}}});
        if(!current) throw new EmployeeError(404,'not_found');
        const roles=await tx.role.findMany({where:{clinicId,id:{in:roleIds}}});
        if(roles.length!==roleIds.length) throw new EmployeeError(400,'invalid_roles');
        if(current.active && current.userRoles.some(ur=>ur.role.key==='admin') && !roles.some(r=>r.key==='admin')) {
          const count=await tx.user.count({where:{clinicId,active:true,userRoles:{some:{role:{key:'admin'}}}}});
          if(count<=1) throw new EmployeeError(409,'last_admin');
        }
        await tx.user.update({where:{id:current.id},data:{name:name.trim(),username:username.trim()}});
        await tx.userRole.deleteMany({where:{clinicId,userId:current.id}});
        await tx.userRole.createMany({data:roleIds.map(roleId=>({clinicId,userId:current.id,roleId}))});
        return tx.user.findUniqueOrThrow({where:{id:current.id},select:selectEmployee});
      });
      return res.json(expose(user));
    } catch(err){return respondError(err,res,next)}
  });
  return router;
}
