export function loginFailure(status:number):'invalid'|'limit'|'origin'|'server' {
  if(status===400||status===401)return 'invalid';
  if(status===429)return 'limit';
  if(status===403)return 'origin';
  return 'server';
}
