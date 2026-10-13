'use strict';
module.exports = async function assertDatabaseRole(client) {
    const { rows } = await client.query(`
        SELECT current_user AS name, r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb,
            EXISTS(SELECT 1 FROM pg_class c WHERE c.relrowsecurity AND pg_has_role(current_user, c.relowner, 'MEMBER')) AS owns_protected_tables
        FROM pg_roles r WHERE r.rolname = current_user
    `);
    const role = rows[0];
    if (!role || role.rolsuper || role.rolbypassrls || role.rolcreaterole || role.rolcreatedb || role.owns_protected_tables) {
        throw new Error('Database runtime role must be unprivileged, NOBYPASSRLS and separate from the schema owner');
    }
};
