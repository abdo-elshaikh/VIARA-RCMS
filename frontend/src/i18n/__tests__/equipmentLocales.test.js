import { describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import arWorkspace from '../locales/ar/workspace.json';
import enWorkspace from '../locales/en/workspace.json';
import arCommon from '../locales/ar/common.json';
import enCommon from '../locales/en/common.json';
import { createEquipmentTranslator } from '../../utils/equipmentTranslation';

describe('equipment translations', () => {
    it.each(['ar', 'en'])('resolves nested equipment labels, legacy labels and shared retry in %s', async language => {
        const i18n = createInstance();
        await i18n.init({ lng: language, defaultNS: 'workspace', fallbackLng: false, resources: {
            ar: { workspace: arWorkspace, common: arCommon }, en: { workspace: enWorkspace, common: enCommon }
        } });
        const t = createEquipmentTranslator(i18n.getFixedT(language, 'workspace'));
        const workspace = language === 'ar' ? arWorkspace : enWorkspace;
        const common = language === 'ar' ? arCommon : enCommon;
        expect(t('equipmentSections')).toBe(workspace.equipment.equipmentSections);
        expect(t('matrixLoadError')).toBe(workspace.equipment.matrixLoadError);
        expect(t('equipmentFleet')).toBe(workspace.equipmentFleet);
        expect(t('maintenance')).toBe(workspace.maintenance);
        expect(t('downtimeLogs')).toBe(workspace.downtimeLogs);
        expect(t('equipmentSections')).not.toContain('returned an object');
        expect(t('common:retry')).toBe(common.retry);
        expect(t('maintenance.types.Calibration & Preventive Maintenance'))
            .toBe(workspace.equipment.maintenance.types['Calibration & Preventive Maintenance']);
        expect(t('maintenance.types.Custom vendor inspection', { defaultValue: 'Custom vendor inspection' }))
            .toBe('Custom vendor inspection');
        expect(t('unknown', { defaultValue: 'Fallback' })).toBe('Fallback');
    });
});
