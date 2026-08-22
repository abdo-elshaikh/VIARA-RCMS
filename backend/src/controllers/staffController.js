const bcrypt = require('bcrypt');
const { AppError } = require('../middleware/errorHandler');
const { logAction } = require('../services/auditService');
const {
    assertCanAssignRole,
    assertProtectedUserMutation,
    isProtectedRole
} = require('../utils/roleGovernance');
const { triggerEventForRole } = require('../services/notificationJobService');

const getAllStaff = (db) => async (req, res, next) => {
    try {
        const canManage = ['Developer', 'Admin', 'HR'].includes(req.user.role);
        const result = await db.query(canManage
            ? "SELECT user_id, full_name, email, role, is_active, created_at FROM users WHERE role != 'Referring_Doctor' ORDER BY created_at DESC"
            : "SELECT user_id, full_name, role FROM users WHERE role != 'Referring_Doctor' AND is_active = TRUE ORDER BY full_name ASC");
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createStaff = (db) => async (req, res, next) => {
    let client;
    try {
        const data = req.body;
        const fullName = (data.fullName || data.full_name || '').trim();
        const email = (data.email || '').trim().toLowerCase();
        const role = data.role;
        const password = data.password;

        if (!fullName || !email || !role || !password) {
            throw new AppError('Full name, email, password, and role are required', 400);
        }
        assertCanAssignRole(req.user, role);

        // Hash Password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        client = await db.connect();
        await client.query('BEGIN');
        const result = await client.query(
            "INSERT INTO users (full_name, email, password_hash, role, must_change_password) VALUES ($1, $2, $3, $4, TRUE) RETURNING user_id, full_name, email, role",
            [fullName, email, hashedPassword, role]
        );
        await client.query('COMMIT');

        logAction(db, {
            userId: req.user.user_id, action: 'STAFF_CREATED', resourceId: result.rows[0].user_id,
            resourceTable: 'users', ipAddress: req.ip, details: { role, protectedRole: isProtectedRole(role) }, required: isProtectedRole(role)
        }).catch(err => console.error("Non-blocking audit log error:", err));

        triggerEventForRole(db, 'STAFF_CREATED', 'Admin', {
            priority: 'Normal',
            variables: {
                staff_name: fullName,
                staff_email: email,
                role: role,
                created_by: req.user?.full_name || req.user?.email || 'Unknown'
            }
        }).catch(() => {});

        triggerEventForRole(db, 'STAFF_CREATED', 'HR', {
            priority: 'Normal',
            variables: {
                staff_name: fullName,
                staff_email: email,
                role: role,
                created_by: req.user?.full_name || req.user?.email || 'Unknown'
            }
        }).catch(() => {});

        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        if (error.code === '23505') { // Unique constraint
            return next(new AppError('Email already exists', 409));
        }
        next(error);
    } finally {
        if (client) client.release();
    }
};

const updateStaff = (db) => async (req, res, next) => {
    let client;
    try {
        const { id } = req.params;
        const { fullName, email, role, isActive, password } = req.body;
        client = await db.connect();
        await client.query('BEGIN');
        const targetResult = await client.query(
            'SELECT user_id, role, is_active FROM users WHERE user_id = $1 FOR UPDATE', [id]
        );
        if (!targetResult.rows.length) throw new AppError('User not found', 404);
        await assertProtectedUserMutation(client, req.user, targetResult.rows[0], role, isActive);

        // Dynamic update fields
        const fields = [];
        const values = [];
        let idx = 1;

        if (fullName) { fields.push(`full_name = $${idx++}`); values.push(fullName); }
        if (email) { fields.push(`email = $${idx++}`); values.push(email); }
        if (role) { fields.push(`role = $${idx++}`); values.push(role); }
        if (isActive !== undefined) { fields.push(`is_active = $${idx++}`); values.push(isActive); }

        if (password && password.length >= 6) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            fields.push(`password_hash = $${idx++}`);
            values.push(hashedPassword);
        }

        if (fields.length === 0) throw new AppError('No fields to update', 400);

        values.push(id);
        const query = `UPDATE users SET ${fields.join(', ')} WHERE user_id = $${idx} RETURNING user_id, full_name, role, is_active`;

        const result = await client.query(query, values);

        if (role || isActive === false || password) {
            await client.query(`
                UPDATE refresh_tokens
                SET revoked = TRUE, revoked_at = NOW(), revoked_reason = 'staff_security_profile_changed'
                WHERE user_id = $1 AND revoked = FALSE
            `, [id]);
        }
        await client.query('COMMIT');

        const target = targetResult.rows[0];
        logAction(db, {
            userId: req.user.user_id, action: 'STAFF_UPDATED', resourceId: id,
            resourceTable: 'users', ipAddress: req.ip,
            details: {
                changedFields: Object.keys(req.body).filter(key => key !== 'password'),
                previousRole: target.role,
                nextRole: role || target.role,
                protectedRole: isProtectedRole(target.role) || isProtectedRole(role)
            },
            required: isProtectedRole(target.role) || isProtectedRole(role)
        }).catch(err => console.error("Non-blocking audit log error:", err));

        triggerEventForRole(db, 'STAFF_UPDATED', 'Admin', {
            priority: 'Normal',
            variables: {
                staff_name: fullName || target.full_name,
                staff_email: email || '',
                changed_fields: Object.keys(req.body).filter(key => key !== 'password').join(', ') || 'none'
            }
        }).catch(() => {});

        triggerEventForRole(db, 'STAFF_UPDATED', 'HR', {
            priority: 'Normal',
            variables: {
                staff_name: fullName || target.full_name,
                staff_email: email || '',
                changed_fields: Object.keys(req.body).filter(key => key !== 'password').join(', ') || 'none'
            }
        }).catch(() => {});

        res.json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error.code === '23505') return next(new AppError('Email already exists', 409));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const deleteStaff = (db) => async (req, res, next) => {
    let client;
    try {
        const { id } = req.params;
        client = await db.connect();
        await client.query('BEGIN');
        const targetResult = await client.query(
            'SELECT user_id, role, is_active FROM users WHERE user_id = $1 FOR UPDATE', [id]
        );
        if (!targetResult.rows.length) throw new AppError('User not found', 404);
        await assertProtectedUserMutation(client, req.user, targetResult.rows[0], targetResult.rows[0].role, false);
        const result = await client.query(
            "UPDATE users SET is_active = false WHERE user_id = $1 RETURNING user_id", 
            [id]
        );
        await client.query(`
            UPDATE refresh_tokens
            SET revoked = TRUE, revoked_at = NOW(), revoked_reason = 'staff_deactivated'
            WHERE user_id = $1 AND revoked = FALSE
        `, [id]);
        await logAction(client, {
            userId: req.user.user_id, action: 'STAFF_DEACTIVATED', resourceId: id,
            resourceTable: 'users',
            ipAddress: req.ip,
            details: {
                previousRole: targetResult.rows[0].role,
                protectedRole: isProtectedRole(targetResult.rows[0].role)
            },
            required: true
        });
        await client.query('COMMIT');

        triggerEventForRole(db, 'STAFF_DEACTIVATED', 'Admin', {
            priority: 'Normal',
            variables: {
                staff_name: targetResult.rows[0].full_name || '',
                staff_email: '',
                role: targetResult.rows[0].role
            }
        }).catch(() => {});

        triggerEventForRole(db, 'STAFF_DEACTIVATED', 'HR', {
            priority: 'Normal',
            variables: {
                staff_name: targetResult.rows[0].full_name || '',
                staff_email: '',
                role: targetResult.rows[0].role
            }
        }).catch(() => {});

        res.json({ message: 'User deactivated successfully' });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

module.exports = { getAllStaff, createStaff, updateStaff, deleteStaff };
