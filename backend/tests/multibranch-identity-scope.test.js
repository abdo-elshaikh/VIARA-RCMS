const { createStaff, updateStaff, deleteStaff, getAllStaff } = require('../src/controllers/staffController');
const { register } = require('../src/controllers/authController');
const org = '00000000-0000-4000-8000-000000000000';
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
test.each([createStaff, updateStaff, deleteStaff, register])('branch administrators cannot mutate global staff identities', async handler => {
    const db={connect:jest.fn(),query:jest.fn()},next=jest.fn();
    await handler(db)({user:{role:'Admin',organization_id:org,is_org_admin:false},body:{},params:{id:'target'}},response(),next);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
    expect(db.connect).not.toHaveBeenCalled();expect(db.query).not.toHaveBeenCalled();
});
test('staff lists constrain organization, branch membership and exclude internal service accounts', async()=>{
    const db={query:jest.fn().mockResolvedValue({rows:[]})},next=jest.fn();
    await getAllStaff(db)({user:{role:'Admin',organization_id:org},branchContext:{branchId:'A'}},response(),next);
    expect(next).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('AND NOT is_service_account'),[org,false,'A']);
    expect(db.query.mock.calls[0][0]).toContain('m.branch_id = $3');
});
test.each([updateStaff,deleteStaff])('global identity managers cannot change a user from another organization',async handler=>{
    const client={query:jest.fn(async sql=>({rows:sql.startsWith('SELECT user_id')?[{user_id:'target',role:'Nurse',organization_id:'OTHER'}]:[]})),release:jest.fn()};
    const next=jest.fn();
    await handler({connect:jest.fn().mockResolvedValue(client)})({user:{role:'Admin',organization_id:org,is_org_admin:true},params:{id:'target'},body:{}},response(),next);
    expect(next.mock.calls[0][0].statusCode).toBe(404);
    expect(client.query.mock.calls.some(([sql])=>sql.startsWith('UPDATE users'))).toBe(false);
});
