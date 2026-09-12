import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import ar from '../locales/ar/system.json';
import en from '../locales/en/system.json';
import arCommon from '../locales/ar/common.json';
import enCommon from '../locales/en/common.json';
import {
    getLocalizedChannelDescription,
    getLocalizedChannelName,
    getLocalizedStaffRole
} from '../../components/communications/chatLocalization';
import { getLocalizedDemoUserName } from '../../utils/localizedDemoData';

const COMMUNICATION_FILES = [
    'src/components/communications/CommunicationCenter.jsx',
    'src/components/communications/ChatBubble.jsx',
    'src/components/communications/chatLocalization.js',
    'src/utils/localizedDemoData.js'
];

const readSources = () => COMMUNICATION_FILES
    .map(file => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8'))
    .join('\n');

const literalChatKeys = (source) => [...new Set(
    [...source.matchAll(/['"](chat\.[A-Za-z0-9_]+)['"]/g)].map(match => match[1].slice('chat.'.length))
)];

const translator = locale => (key, options = {}) => {
    const value = key.split('.').reduce((current, part) => current?.[part], locale);
    return value ?? options.defaultValue ?? key;
};

describe('communications locale contract', () => {
    it('defines every literal chat translation in English and Arabic', () => {
        const keys = literalChatKeys(readSources());
        expect(keys.filter(key => en.chat[key] === undefined)).toEqual([]);
        expect(keys.filter(key => ar.chat[key] === undefined)).toEqual([]);
    });

    it('localizes system channels without changing custom channel names', () => {
        const t = translator(ar);
        const general = { channel_id: 'general', display_name: 'General Hub', is_system: true };
        const custom = { channel_id: 'mri', display_name: 'MRI Team', description: 'MRI only' };

        expect(getLocalizedChannelName(general, t)).toBe('المركز العام');
        expect(getLocalizedChannelDescription(general, t)).toBe('إعلانات ونقاشات على مستوى المركز');
        expect(getLocalizedChannelName(custom, t)).toBe('MRI Team');
        expect(getLocalizedChannelDescription(custom, t)).toBe('MRI only');
    });

    it('localizes staff roles and the common cancel action', () => {
        const source = readSources();
        expect(getLocalizedStaffRole('Radiologist', translator(ar))).toBe('طبيب أشعة');
        expect(getLocalizedStaffRole('Custom Role', translator(ar))).toBe('Custom Role');
        expect(source).toContain("t('common:actions.cancel'");
        expect(source).not.toContain("t('common.cancel'");
    });

    it('localizes only known demo users and preserves real user names', () => {
        const t = (key, options = {}) => {
            const [namespace, pathKey] = key.split(':');
            const locale = namespace === 'common' ? arCommon : ar;
            return pathKey?.split('.').reduce((value, part) => value?.[part], locale) ?? options.defaultValue ?? key;
        };

        expect(Object.keys(arCommon.demoUsers).sort()).toEqual(Object.keys(enCommon.demoUsers).sort());
        expect(getLocalizedDemoUserName('Sarah Receptionist (Lead Desk)', t)).toBe('سارة موظفة الاستقبال (مسؤولة المكتب)');
        expect(getLocalizedDemoUserName('د. مستخدم حقيقي', t)).toBe('د. مستخدم حقيقي');
    });
});
