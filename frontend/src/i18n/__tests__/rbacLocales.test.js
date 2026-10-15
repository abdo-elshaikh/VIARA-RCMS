import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../locales/en/admin.json';
import ar from '../locales/ar/admin.json';

const RBAC_PAGE = path.resolve(process.cwd(), 'src/pages/RoleManagement.jsx');
const RBAC_CONTROLLER = path.resolve(process.cwd(), '../backend/src/controllers/rbacController.js');

const source = fs.readFileSync(RBAC_PAGE, 'utf8');

const hasKey = (locale, key) => key.split('.').reduce((value, part) => value?.[part], locale) !== undefined;

const literalRbacKeys = [...source.matchAll(/\bt\(\s*['"](rbac\.[^'"]+)['"]/g)]
    .map((match) => match[1]);

const extractDeveloperOnlyPermissions = (text) => {
    const block = text.match(/const DEVELOPER_ONLY_PERMISSIONS\s*=\s*(?:new Set\()?\[([\s\S]*?)\](?:\))?;/)?.[1] || '';
    return [...block.matchAll(/['"]([A-Z][A-Z0-9_]*)['"]/g)].map((match) => match[1]).sort();
};

describe('RBAC locale and policy contract', () => {
    it('defines every literal RBAC translation used by the page', () => {
        expect(literalRbacKeys.filter((key) => !hasKey(en, key))).toEqual([]);
        expect(literalRbacKeys.filter((key) => !hasKey(ar, key))).toEqual([]);
    });

    it('keeps the interactive RBAC sections aligned in English and Arabic', () => {
        const sections = ['actions', 'values', 'risk', 'inspector', 'review', 'messages', 'readOnly', 'audit', 'states', 'unsaved', 'confirm'];
        sections.forEach((section) => {
            expect(Object.keys(ar.rbac[section]).sort(), `Arabic rbac.${section} differs from English`).toEqual(
                Object.keys(en.rbac[section]).sort()
            );
        });
    });

    it('keeps Developer-only permissions aligned with backend enforcement', () => {
        const backendSource = fs.readFileSync(RBAC_CONTROLLER, 'utf8');
        expect(extractDeveloperOnlyPermissions(source)).toEqual(extractDeveloperOnlyPermissions(backendSource));
    });
});
