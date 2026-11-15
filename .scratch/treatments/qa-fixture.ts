import {createPrismaClient} from "../../server/database";
import {hashPassword} from "../../server/password";
const url=new URL(process.env.DATABASE_URL!);
if(url.pathname!=="/dentex_test"||url.port!=="55464")throw Error("Treatment QA55464 only");
const db=createPrismaClient();
let clinic=await db.clinic.findUnique({where:{code:"9876"}});
if(!clinic) {
  clinic=await db.clinic.create({data:{name:"Treatment QA — synthetic",code:"9876"}});
  const role=await db.role.create({data:{clinicId:clinic.id,key:"dentist"}});
  for(const key of ["patients.read","patients.write","appointments.read","appointments.write"]) {
    await db.permission.upsert({where:{key},create:{key},update:{}});
    await db.rolePermission.create({data:{roleId:role.id,permissionKey:key}});
  }
  const user=await db.user.create({data:{clinicId:clinic.id,name:"QA Dentist",username:"qa.dentist",passwordHash:await hashPassword("Synthetic-QA-Only-2026!")}});
  await db.userRole.create({data:{clinicId:clinic.id,userId:user.id,roleId:role.id}});
  await db.patientNumbering.create({data:{clinicId:clinic.id,start:1n,lastNumber:1n}});
  const p=await db.patient.create({data:{clinicId:clinic.id,name:"مريض فحص مصطنع / Patient QA",fileNumber:1n,phone:"+22220123456",gender:"male",isChild:true}});
  const attendance=await db.attendance.create({data:{clinicId:clinic.id,patientId:p.id,doctorId:user.id,createdBy:user.id,status:"with_doctor",editVersion:2}});
  await db.visit.create({data:{clinicId:clinic.id,attendanceId:attendance.id,patientId:p.id,doctorId:user.id,createdBy:user.id,startedAt:new Date()}});
}
const patient=await db.patient.findFirstOrThrow({where:{clinicId:clinic.id}});
if(process.argv.includes("--new-visit")){
  const doctor=await db.user.findFirstOrThrow({where:{clinicId:clinic.id,username:"qa.dentist"}});
  if(!await db.visit.findFirst({where:{clinicId:clinic.id,status:"in_progress"}})){
    const row=await db.attendance.create({data:{clinicId:clinic.id,patientId:patient.id,doctorId:doctor.id,createdBy:doctor.id,status:"with_doctor",editVersion:2}});
    await db.visit.create({data:{clinicId:clinic.id,attendanceId:row.id,patientId:patient.id,doctorId:doctor.id,createdBy:doctor.id,startedAt:new Date()}});
  }
}
console.log(JSON.stringify({patientId:patient.id,clinicCode:clinic.code}));
await db.$disconnect();
