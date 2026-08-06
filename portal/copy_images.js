import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = 'C:/Users/Abdo/.gemini/antigravity-ide/brain/37e14945-04e0-420f-ba28-db1ac37e6c0b';
const destDir = path.join(__dirname, 'public', 'images', 'scans');

const imageMappings = {
    'mri_machine': 'mri_machine.png',
    'ct_machine': 'ct_machine.png',
    'ultrasound_machine': 'ultrasound_machine.png',
    'mammography_machine': 'mammography_machine.png',
    'xray_machine': 'xray_machine.png',
    'petct_machine': 'petct_machine.png',
    'dexa_machine': 'dexa_machine.png',
    'fluoroscopy_machine': 'fluoroscopy_machine.png',
    'interventional_machine': 'interventional_machine.png',
    'dental_machine': 'dental_machine.png'
};

if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
}

try {
    const files = fs.readdirSync(srcDir);
    let copiedCount = 0;

    files.forEach(file => {
        Object.keys(imageMappings).forEach(prefix => {
            if (file.startsWith(prefix) && file.endsWith('.png')) {
                const srcPath = path.join(srcDir, file);
                const destPath = path.join(destDir, imageMappings[prefix]);
                fs.copyFileSync(srcPath, destPath);
                console.log(`✅ Copied: ${imageMappings[prefix]}`);
                copiedCount++;
            }
        });
    });

    console.log(`\n🎉 Successfully copied ${copiedCount} generated images to public/images/scans/!`);
} catch (error) {
    console.error('Error copying files:', error);
}
