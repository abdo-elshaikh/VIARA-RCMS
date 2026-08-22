const express = require('express');
const multer = require('multer');
const path = require('path');
const { importPatients, importInsuranceContracts, findImportDuplicates } = require('../controllers/importController');
const { hasPermission } = require('../middleware/rbacMiddleware');

// Multer config for CSV uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../../uploads/documents')); // reuse docs folder for temp CSV storage
    },
    filename: (req, file, cb) => {
        cb(null, `import_${Date.now()}_${file.originalname}`);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel') {
            cb(null, true);
        } else {
            cb(new Error('Only .csv files are allowed!'), false);
        }
    }
});

module.exports = (pool, authenticateToken, authorizeRole) => {
    const router = express.Router();
    
    // Only Admin can do bulk imports
    router.use(authenticateToken);
    router.use(authorizeRole(['Admin']));

    router.post('/patients', hasPermission(pool, 'CREATE_PATIENTS'), upload.single('file'), importPatients(pool));
    router.post('/insurance-contracts', hasPermission(pool, 'MANAGE_INSURANCE_CONTRACTS'), upload.single('file'), importInsuranceContracts(pool));
    router.get('/patients/duplicates', hasPermission(pool, 'VIEW_PATIENTS'), findImportDuplicates(pool));

    return router;
};
