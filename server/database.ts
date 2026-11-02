import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
export function createPrismaClient(){
  const adapter=new PrismaPg({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
  return new PrismaClient({adapter});
}
