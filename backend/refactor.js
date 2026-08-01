const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src', 'controllers');
const files = fs.readdirSync(dir);

files.forEach(file => {
    // Skip the ones I already manually refactored
    if (file === 'patientController.js' || file === 'authController.js' || file === 'portalController.js' || file === 'appointmentController.js') {
        return;
    }

    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Add `next` to async (req, res) parameters
    content = content.replace(/\(req,\s*res\)\s*=>/g, '(req, res, next) =>');

    // Replace the standard catch block with next(error)
    content = content.replace(/catch\s*\(\s*error\s*\)\s*\{\s*console\.error\([^)]+\);\s*res\.status\(500\)\.json\(\{[^}]+\}\);\s*\}/g, 'catch (error) {\n        next(error);\n    }');

    // Replace other res.status(500) variations
    content = content.replace(/res\.status\(500\)\.json\(\{.*\}\);/g, 'next(error);');

    // Write back
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Refactored ${file}`);
});
