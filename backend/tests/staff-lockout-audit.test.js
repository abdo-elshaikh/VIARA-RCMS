jest.mock('bcrypt',()=>({compare:jest.fn()}));
jest.mock('../src/services/securityEventService',()=>({logSecurityEvent:jest.fn().mockResolvedValue()}));
jest.mock('../src/services/auditService',()=>({logAction:jest.fn().mockResolvedValue()}));
jest.mock('../src/services/notificationJobService',()=>({triggerEventForRole:jest.fn().mockResolvedValue()}));
const bcrypt=require('bcrypt');const {login}=require('../src/controllers/authController');
const user={user_id:'synthetic-user',full_name:'Synthetic',password_hash:'hash',failed_login_attempts:0};
const req={body:{email:'synthetic@example.test',password:'wrong'},get:()=>'',ip:'127.0.0.1'};
beforeEach(()=>jest.clearAllMocks());
test('a locked account never compares a password, even a correct one',async()=>{
 const db={query:jest.fn().mockResolvedValue({rows:[{...user,locked_until:new Date(Date.now()+60000)}]})},next=jest.fn();bcrypt.compare.mockResolvedValue(true);
 await login(db)(req,{},next);expect(bcrypt.compare).not.toHaveBeenCalled();expect(db.query).toHaveBeenCalledTimes(1);expect(next.mock.calls[0][0].statusCode).toBe(401);
});
test('failed guesses use an atomic SQL increment rather than a stale read',async()=>{
 const db={query:jest.fn().mockResolvedValueOnce({rows:[user]}).mockResolvedValueOnce({rows:[{failed_login_attempts:5,locked_until:new Date(Date.now()+60000)}]})},next=jest.fn();bcrypt.compare.mockResolvedValue(false);
 await login(db)(req,{},next);expect(db.query.mock.calls[1][0]).toContain('COALESCE(failed_login_attempts, 0) + 1');expect(db.query.mock.calls[1][1]).toEqual([user.user_id]);expect(next.mock.calls[0][0].statusCode).toBe(401);
});
