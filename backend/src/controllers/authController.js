const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../config/logger');
const { logAction } = require('../services/auditService');
const { logSecurityEvent } = require('../services/securityEventService');
const { permissionCache } = require('../middleware/rbacMiddleware');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');
const { encrypt, decrypt, hash } = require('../utils/crypto');
const AuthService = require('../services/authService');
const { attachActiveEmergencyClaims } = require('../services/emergencyAccessService');
const { triggerEvent, triggerEventForRole } = require('../services/notificationJobService');

// 12 rounds per current OWASP guidance for medical systems; existing hashes
// embed their own cost factor so verification of old hashes is unaffected.
const SALT_ROUNDS = 12;
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

const getPermissionNamesForRole = async (db, role, bypassCache = false) => {
    if (role === 'Developer') {
        const result = await db.query('SELECT name FROM permissions ORDER BY name');
        return result.rows.map(row => row.name);
    }

    if (!bypassCache) {
        const cached = permissionCache.get(role);
        if (cached && cached.size > 0) {
            return Array.from(cached);
        }
    }

    const result = await db.query(`
        SELECT p.name
        FROM role_permissions rp
        JOIN permissions p ON p.permission_id = rp.permission_id
        WHERE rp.role_name = $1
        ORDER BY p.name
    `, [role]);
    return result.rows.map(row => row.name);
};

// Legacy function calls mapped to new AuthService for backward compatibility
const generateTokens = async (db, userPayload, ownerId, ownerTypeOrIsPatient = false, session = {}) => {
    return await AuthService.generateTokens(db, userPayload, ownerId, ownerTypeOrIsPatient, session);
};

const register = (db) => async (req, res, next) => {
    try {
        const { fullName, email, password, role } = req.body;

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        const query = `
      INSERT INTO users (full_name, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      RETURNING user_id, full_name, email, role, created_at
    `;

        const result = await db.query(query, [fullName, email, hashedPassword, role]);

        res.status(201).json({ message: 'User registered successfully', user: result.rows[0] });

    } catch (error) {
        if (error.code === '23505') { // Unique violation for email
            return next(new AppError('Email already exists', 409));
        }
        next(error);
    }
};

const login = (db) => async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const normalizedEmail = String(email || '').trim().toLowerCase();

        const query = 'SELECT * FROM users WHERE LOWER(email) = $1 AND is_active = TRUE';
        const result = await db.query(query, [normalizedEmail]);

        if (result.rows.length === 0) {
            await logSecurityEvent(db, {
                eventType: 'LOGIN_FAILED',
                severity: 'warning',
                ipAddress: req.ip,
                userAgent: req.get('user-agent'),
                details: { reason: 'unknown_user' }
            });
            triggerEventForRole(db, 'LOGIN_FAILED', 'Admin', { priority: 'Warning' }).catch(() => { });
            triggerEventForRole(db, 'LOGIN_FAILED', 'HR', { priority: 'Warning' }).catch(() => { });
            logger.warn('LOGIN_FAILED', { reason: 'unknown_user', ip: req.ip });
            return next(new AppError('Invalid Credentials', 401));
        }

        const user = result.rows[0];

        // 1. Check Lockout & Password Validation
        const isLocked = Boolean(user.locked_until && new Date() < new Date(user.locked_until));
        const match = await bcrypt.compare(password, user.password_hash);

        if (isLocked) {
            if (match) {
                // Correct password supplied: auto-unlock account and reset counters
                await db.query(`UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE user_id = $1`, [user.user_id]);
                user.locked_until = null;
                user.failed_login_attempts = 0;
            } else {
                await logSecurityEvent(db, {
                    eventType: 'ACCOUNT_LOCKED_ACCESS',
                    severity: 'critical',
                    userId: user.user_id,
                    ipAddress: req.ip,
                    details: { lockedUntil: user.locked_until }
                });
                triggerEventForRole(db, 'ACCOUNT_LOCKED_ACCESS', 'Admin', { priority: 'Critical' }).catch(() => { });
                triggerEventForRole(db, 'ACCOUNT_LOCKED_ACCESS', 'HR', { priority: 'Critical' }).catch(() => { });
                logger.warn('ACCOUNT_LOCKED_ACCESS_ATTEMPT', { userId: user.user_id, ip: req.ip });
                return next(new AppError('Account is locked due to too many failed attempts. Try again in 15 minutes.', 403));
            }
        }

        // 2. Handle Failed Login
        if (!match) {
            const attempts = (user.failed_login_attempts || 0) + 1;
            let lockedUntil = null;
            if (attempts >= 5) {
                const lockTime = new Date();
                lockTime.setMinutes(lockTime.getMinutes() + 15);
                lockedUntil = lockTime.toISOString();
            }

            await db.query(`UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE user_id = $3`, [attempts, lockedUntil, user.user_id]);

            await logAction(db, {
                userId: user.user_id,
                action: 'LOGIN_FAILED',
                resourceId: user.user_id,
                resourceTable: 'users',
                ipAddress: req.ip,
                details: { reason: 'Invalid password', attempts, lockedOut: !!lockedUntil }
            });

            await logSecurityEvent(db, {
                eventType: lockedUntil ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
                severity: lockedUntil ? 'critical' : 'warning',
                userId: user.user_id,
                ipAddress: req.ip,
                userAgent: req.get('user-agent'),
                details: { attempts, lockedOut: !!lockedUntil }
            });

            if (lockedUntil) {
                triggerEventForRole(db, 'ACCOUNT_LOCKED', 'Admin', { priority: 'Critical' }).catch(() => { });
                triggerEventForRole(db, 'ACCOUNT_LOCKED', 'HR', { priority: 'Critical' }).catch(() => { });
            } else {
                triggerEventForRole(db, 'LOGIN_FAILED', 'Admin', { priority: 'Warning' }).catch(() => { });
                triggerEventForRole(db, 'LOGIN_FAILED', 'HR', { priority: 'Warning' }).catch(() => { });
            }

            logger.warn('LOGIN_FAILED', { reason: 'invalid_password', userId: user.user_id, attempts, lockedOut: !!lockedUntil, ip: req.ip });

            const remainingAttempts = Math.max(0, 5 - attempts);
            const isAr = req.get('accept-language')?.includes('ar') || req.body?.language === 'ar';

            const errorMessage = lockedUntil
                ? (isAr
                    ? 'تم إغلاق الحساب بسبب محاولات دخول فاشلة متكررة. يرجى المحاولة بعد 15 دقيقة.'
                    : 'Account is locked due to too many failed attempts. Try again in 15 minutes.')
                : (isAr
                    ? `بيانات الاعتماد غير صحيحة. متبقي ${remainingAttempts} محاولة قبل إغلاق الحساب (${attempts}/5).`
                    : `Invalid credentials. ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining before account lock (${attempts}/5).`);

            return next(new AppError(errorMessage, 401));
        }

        // 3. Reset failed attempts on success
        if (user.failed_login_attempts > 0 || user.locked_until) {
            await db.query(`UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE user_id = $1`, [user.user_id]);
        }

        // 3.5 Check Shift-Based Login Restriction (if enabled in system_settings)
        try {
            const restrictionSetting = await db.query(`
                SELECT setting_key, setting_value FROM system_settings
                WHERE setting_key IN (
                    'hr.attendance.enforce_shift_login_restriction',
                    'hr.attendance.login_buffer_before_minutes',
                    'hr.attendance.login_buffer_after_minutes',
                    'hr.attendance.exempt_roles_from_login_restriction'
                )
            `);
            const settingsMap = {};
            for (const row of restrictionSetting.rows) {
                settingsMap[row.setting_key] = row.setting_value;
            }
            const enforceRestriction = (settingsMap['hr.attendance.enforce_shift_login_restriction'] ?? 'false').toLowerCase() === 'true';
            if (enforceRestriction) {
                const exemptRoles = (settingsMap['hr.attendance.exempt_roles_from_login_restriction'] || 'Admin,Developer,HR,Doctor,Radiologist,Physician')
                    .split(',')
                    .map(r => r.trim().toLowerCase());
                const userRoleNormalized = (user.role || '').toLowerCase();
                if (!exemptRoles.includes(userRoleNormalized)) {
                    const bufferBefore = Number.parseInt(settingsMap['hr.attendance.login_buffer_before_minutes'] ?? '30', 10) || 30;
                    const bufferAfter = Number.parseInt(settingsMap['hr.attendance.login_buffer_after_minutes'] ?? '30', 10) || 30;

                    const activeShift = await db.query(`
                        SELECT shift_id, start_time, end_time
                        FROM staff_shifts
                        WHERE user_id = $1
                          AND CURRENT_TIMESTAMP >= (start_time - ($2::int * INTERVAL '1 minute'))
                          AND CURRENT_TIMESTAMP <= (end_time + ($3::int * INTERVAL '1 minute'))
                        LIMIT 1
                    `, [user.user_id, bufferBefore, bufferAfter]);

                    if (!activeShift.rows.length) {
                        const emergencyPerm = await db.query(`
                            SELECT permission_id FROM attendance_permissions
                            WHERE user_id = $1
                              AND effective_date = CURRENT_DATE
                              AND permission_type = 'EmergencyAccess'
                              AND status = 'Approved'
                            LIMIT 1
                        `, [user.user_id]);

                        if (!emergencyPerm.rows.length) {
                            const isAr = req.get('accept-language')?.includes('ar') || req.body?.language === 'ar';
                            const errMsg = isAr
                                ? 'لا يمكنك تسجيل الدخول خارج أوقات ورديتك المعتمدة. يرجى مراجعة إدارة الموارد البشرية.'
                                : 'Access restricted: You cannot log in outside your scheduled shift window. Please contact HR.';
                            await logAction(db, {
                                userId: user.user_id,
                                action: 'LOGIN_BLOCKED_OUTSIDE_SHIFT',
                                resourceId: user.user_id,
                                resourceTable: 'users',
                                ipAddress: req.ip,
                                details: { role: user.role }
                            });
                            return next(new AppError(errMsg, 403, true, 'LOGIN_OUTSIDE_SHIFT_HOURS'));
                        }
                    }
                }
            }
        } catch (restrictionErr) {
            if (restrictionErr instanceof AppError) return next(restrictionErr);
            logger.warn('Failed checking shift login restriction:', { error: restrictionErr.message });
        }

        // 4. Handle 2FA if enabled
        if (user.is_2fa_enabled) {
            // Issue a temporary token just for 2FA verification (valid for 5 mins)
            const tempToken = jwt.sign({ temp_user_id: user.user_id }, process.env.JWT_SECRET, { expiresIn: '5m' });
            return res.json({
                requires2FA: true,
                tempToken,
                message: '2FA required'
            });
        }

        const { token, refreshToken } = await generateTokens(db, {
            user_id: user.user_id, role: user.role, email: user.email, full_name: user.full_name,
            must_change_password: user.must_change_password
        }, user.user_id, false, { ipAddress: req.ip, userAgent: req.get('user-agent') });

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
            path: '/api/auth',
            maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
        });

        await logAction(db, {
            userId: user.user_id,
            action: 'LOGIN_SUCCESS',
            resourceId: user.user_id,
            resourceTable: 'users',
            ipAddress: req.ip,
            details: { role: user.role }
        });

        const permissions = await getPermissionNamesForRole(db, user.role, true);

        res.json({
            message: 'Login Successful',
            token,
            user: {
                id: user.user_id,
                name: user.full_name,
                role: user.role,
                mustChangePassword: user.must_change_password,
                permissions
            }
        });

    } catch (error) {
        next(error);
    }
};

const refresh = (db) => async (req, res, next) => {
    let client;
    let transactionComplete = false;
    try {
        // Manually parse cookies
        const cookies = req.headers.cookie;
        if (!cookies) return next(new AppError('No refresh token provided', 401));

        const match = cookies.match(/(^| )refreshToken=([^;]+)/);
        if (!match) return next(new AppError('No refresh token provided', 401));

        const rawToken = match[2];
        const refreshHash = crypto.createHash('sha256').update(rawToken).digest('hex');

        client = await db.connect();
        await client.query('BEGIN');

        const result = await client.query(`
            SELECT rt.*,
                   u.role, u.email, u.full_name, u.is_active as u_active, u.must_change_password,
                   p.patient_status as p_active, p.first_name_enc, p.last_name_enc,
                   rd.email as doctor_email, rd.full_name as doctor_name, (rd.is_active AND rd.portal_is_active) as doctor_active
            FROM refresh_tokens rt
            LEFT JOIN users u ON rt.user_id = u.user_id
            LEFT JOIN patients p ON rt.patient_id = p.patient_id
            LEFT JOIN referring_doctors rd ON rt.doctor_id = rd.doctor_id
            WHERE rt.token_hash = $1 AND rt.expires_at > NOW()
            FOR UPDATE OF rt
        `, [refreshHash]);

        if (result.rows.length === 0) {
            return next(new AppError('Invalid or expired refresh token', 401));
        }

        const tokenData = result.rows[0];

        const genericOwnerId = tokenData.user_id || tokenData.patient_id || tokenData.doctor_id;

        if (tokenData.revoked) {
            // Token reuse detected - Security Breach!
            await client.query(`UPDATE refresh_tokens SET revoked = TRUE, revoked_at = NOW(), revoked_reason = 'token_reuse_detected' WHERE user_id = $1 OR patient_id = $1 OR doctor_id = $1`, [genericOwnerId]);
            await logSecurityEvent(client, { eventType: 'TOKEN_REUSE_DETECTED', severity: 'critical', details: { tokenId: tokenData.token_id, ownerId: genericOwnerId } });
            triggerEventForRole(db, 'TOKEN_REUSE_DETECTED', 'Admin', { priority: 'Critical' }).catch(() => { });
            triggerEventForRole(db, 'TOKEN_REUSE_DETECTED', 'HR', { priority: 'Critical' }).catch(() => { });
            try {
                await client.query('COMMIT');
                transactionComplete = true;
            } catch (commitErr) {
                logger.error('Token reuse COMMIT failed', { error: commitErr.message, userId: genericOwnerId });
                await client.query('ROLLBACK');
            }
            return next(new AppError('Security breach detected. All sessions revoked.', 401));
        }

        // Revoke old token to implement rotation
        await client.query(`UPDATE refresh_tokens SET revoked = TRUE, revoked_at = NOW(), revoked_reason = 'rotated' WHERE token_id = $1`, [tokenData.token_id]);

        let payload;
        let userId;
        let ownerColumn = 'user_id';

        if (tokenData.user_id) {
            if (!tokenData.u_active) return next(new AppError('User is inactive', 401));
            payload = { user_id: tokenData.user_id, role: tokenData.role, email: tokenData.email, full_name: tokenData.full_name, must_change_password: tokenData.must_change_password };
            userId = tokenData.user_id;
        } else if (tokenData.patient_id) {
            if (tokenData.p_active !== 'Active') return next(new AppError('Patient is inactive', 401));
            payload = { userId: tokenData.patient_id, role: 'Patient', name: decrypt(tokenData.first_name_enc) + ' ' + decrypt(tokenData.last_name_enc) };
            userId = tokenData.patient_id;
            ownerColumn = 'patient_id';
        } else if (tokenData.doctor_id) {
            if (!tokenData.doctor_active) return next(new AppError('Doctor portal account is inactive', 401));
            payload = {
                doctorId: tokenData.doctor_id,
                role: 'Doctor',
                email: tokenData.doctor_email,
                name: tokenData.doctor_name
            };
            userId = tokenData.doctor_id;
            ownerColumn = 'doctor_id';
        } else {
            return next(new AppError('Invalid refresh token owner', 401));
        }

        const newRefreshToken = crypto.randomBytes(40).toString('hex');
        const newRefreshHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
        const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

        await client.query(`
            INSERT INTO refresh_tokens (
                ${ownerColumn}, token_hash, expires_at, parent_token_id,
                ip_address, user_agent, last_used_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [
            userId,
            newRefreshHash,
            expiresAt,
            tokenData.token_id,
            req.ip || tokenData.ip_address || null,
            (req.get('user-agent') || tokenData.user_agent || '').slice(0, 500) || null
        ]);

        try {
            await client.query('COMMIT');
            transactionComplete = true;
        } catch (commitErr) {
            logger.error('Token refresh COMMIT failed', { error: commitErr.message, userId: genericOwnerId });
            return next(new AppError('Internal server error: transaction could not be committed', 500, 'INTERNAL_ERROR'));
        }

        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
            path: '/api/auth',
            maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
        };

        res.cookie('refreshToken', newRefreshToken, cookieOptions);

        // Staff tokens carry the session binding and any active break-glass claims.
        // The refresh payload is rebuilt from scratch, so both must be re-attached
        // here: without the session_id, single-active-session verification and
        // emergency-grant validation silently stop working after a token refresh,
        // dropping a clinician's emergency elevation mid-grant.
        if (tokenData.user_id) {
            try {
                const sessionRes = await db.query(
                    'SELECT current_session_id FROM users WHERE user_id = $1',
                    [tokenData.user_id]
                );
                const sessionId = sessionRes.rows[0]?.current_session_id || null;
                if (sessionId) payload.session_id = sessionId;
                payload = await attachActiveEmergencyClaims(db, payload);
            } catch (claimError) {
                logger.warn('Failed to re-attach session/emergency claims during token refresh', {
                    error: claimError.message,
                    userId: tokenData.user_id
                });
            }
        }

        const token = jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRY || '1h'
        });

        res.json({ token });
    } catch (error) {
        next(error);
    } finally {
        if (client) {
            if (!transactionComplete) {
                try {
                    await client.query('ROLLBACK');
                } catch (_) {
                    // Preserve the original authentication error.
                }
            }
            client.release();
        }
    }
};

const logout = (db) => async (req, res, next) => {
    try {
        const cookies = req.headers.cookie;
        if (cookies) {
            const match = cookies.match(/(^| )refreshToken=([^;]+)/);
            if (match) {
                const rawToken = match[2];
                const refreshHash = crypto.createHash('sha256').update(rawToken).digest('hex');
                // Revoke token
                await db.query(`UPDATE refresh_tokens SET revoked = TRUE, revoked_at = NOW(), revoked_reason = 'logout' WHERE token_hash = $1`, [refreshHash]);
            }
        }
        res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
            path: '/api/auth'
        });
        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        next(error);
    }
};

const setup2FA = (db) => async (req, res, next) => {
    try {
        const userId = req.user.user_id;
        const secret = authenticator.generateSecret();
        const user = await db.query('SELECT email FROM users WHERE user_id = $1', [userId]);

        const otpauth = authenticator.keyuri(user.rows[0].email, 'VIARA', secret);
        const qrCodeUrl = await qrcode.toDataURL(otpauth);

        // Save encrypted secret and hash to user, but don't enable yet
        const secretEnc = encrypt(secret);
        const secretHash = hash(secret);
        await db.query('UPDATE users SET two_factor_secret_enc = $1, two_factor_secret_hash = $2 WHERE user_id = $3', [secretEnc, secretHash, userId]);

        res.json({ secret, qrCodeUrl });
    } catch (error) {
        next(error);
    }
};

const enable2FA = (db) => async (req, res, next) => {
    try {
        const userId = req.user.user_id;
        const { token } = req.body; // the 6 digit code

        const user = await db.query('SELECT two_factor_secret_enc FROM users WHERE user_id = $1', [userId]);
        const secretEnc = user.rows[0]?.two_factor_secret_enc;

        if (!secretEnc) return next(new AppError('2FA not set up', 400));
        const secret = decrypt(secretEnc);

        const isValid = authenticator.check(token, secret);
        if (!isValid) return next(new AppError('Invalid 2FA code', 400));

        await db.query('UPDATE users SET is_2fa_enabled = TRUE WHERE user_id = $1', [userId]);

        await logAction(db, { userId, action: 'ENABLE_2FA', resourceId: userId, resourceTable: 'users', ipAddress: req.ip });

        res.json({ message: '2FA successfully enabled' });
    } catch (error) {
        next(error);
    }
};

const verify2FA = (db) => async (req, res, next) => {
    try {
        const { token, tempToken } = req.body;

        // Decode temp token
        let decoded;
        try {
            decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
        } catch (e) {
            return next(new AppError('Invalid or expired temporary token', 401));
        }

        const userId = decoded.temp_user_id;
        const userRes = await db.query('SELECT * FROM users WHERE user_id = $1', [userId]);
        const user = userRes.rows[0];

        if (!user || !user.is_2fa_enabled || !user.two_factor_secret_enc) return next(new AppError('Invalid user or 2FA not enabled', 400));

        const secret = decrypt(user.two_factor_secret_enc);
        const isValid = authenticator.check(token, secret);
        if (!isValid) return next(new AppError('Invalid 2FA code', 401));

        // Generate full tokens
        const { token: fullToken, refreshToken } = await generateTokens(db, {
            user_id: user.user_id, role: user.role, email: user.email, full_name: user.full_name,
            must_change_password: user.must_change_password
        }, user.user_id, false, { ipAddress: req.ip, userAgent: req.get('user-agent') });

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
            path: '/api/auth',
            maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
        });

        await logAction(db, { userId: user.user_id, action: 'LOGIN_SUCCESS_2FA', resourceId: user.user_id, resourceTable: 'users', ipAddress: req.ip });

        const permissions = await getPermissionNamesForRole(db, user.role, true);

        res.json({
            message: 'Login Successful',
            token: fullToken,
            user: {
                id: user.user_id,
                name: user.full_name,
                role: user.role,
                mustChangePassword: user.must_change_password,
                permissions
            }
        });
    } catch (error) {
        next(error);
    }
};

const changePortalPassword = (db) => async (req, res, next) => {
    let client;
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.user_id || req.user.userId;
        const doctorId = req.user.doctorId;
        const authType = req.authType; // 'jwt' for staff, undefined for portal

        const isPatient = req.user.role === 'Patient' && userId;
        const isDoctor = req.user.role === 'Doctor' && doctorId;

        if (!isPatient && !isDoctor) {
            return next(new AppError('This endpoint is only for portal users', 403));
        }

        client = await db.connect();
        await client.query('BEGIN');

        if (isPatient) {
            const result = await client.query(
                'SELECT password_hash FROM patients WHERE patient_id = $1 AND patient_status = \'Active\' FOR UPDATE',
                [userId]
            );
            if (result.rows.length === 0) {
                throw new AppError('Patient not found', 404);
            }
            const matches = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
            if (!matches) {
                throw new AppError('Current password is incorrect', 400);
            }
            const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
            await client.query(
                'UPDATE patients SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE patient_id = $2',
                [passwordHash, userId]
            );
        } else {
            // Doctor portal
            const result = await client.query(
                'SELECT portal_password_hash FROM referring_doctors WHERE doctor_id = $1 AND portal_is_active = TRUE FOR UPDATE',
                [doctorId]
            );
            if (result.rows.length === 0) {
                throw new AppError('Doctor not found', 404);
            }
            const matches = await bcrypt.compare(currentPassword, result.rows[0].portal_password_hash);
            if (!matches) {
                throw new AppError('Current password is incorrect', 400);
            }
            const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
            await client.query(
                'UPDATE referring_doctors SET portal_password_hash = $1 WHERE doctor_id = $2',
                [passwordHash, doctorId]
            );
        }

        await client.query(`
            UPDATE refresh_tokens
            SET revoked = TRUE, revoked_at = NOW(), revoked_reason = 'password_changed'
            WHERE revoked = FALSE AND (
                ${isPatient ? 'patient_id' : 'doctor_id'} = $1
            )
        `, [isPatient ? userId : doctorId]);

        await client.query('COMMIT');
        client.release();
        client = null;

        await logAction(db, {
            userId: userId || doctorId,
            action: 'PASSWORD_CHANGED_PORTAL',
            resourceId: userId || doctorId,
            resourceTable: isPatient ? 'patients' : 'referring_doctors',
            ipAddress: req.ip,
            details: { authType: 'portal' }
        });

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        if (client) {
            try { await client.query('ROLLBACK'); } catch (_) { }
            client.release();
        }
        next(error);
    }
};

module.exports = {
    register,
    login,
    refresh,
    logout,
    changePortalPassword,
    setup2FA,
    enable2FA,
    verify2FA,
    generateTokens
};
