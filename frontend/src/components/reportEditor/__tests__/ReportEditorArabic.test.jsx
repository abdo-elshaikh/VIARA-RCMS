import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import arWorklist from '../../../i18n/locales/ar/worklist.json';
import { ReportSectionCard } from '../ui';

const getTranslation = (source, path) =>
    path.split('.').reduce((value, key) => value?.[key], source);

const translate = (key, fallback) =>
    getTranslation(arWorklist, key) ??
    (typeof fallback === 'string' ? fallback : fallback?.defaultValue) ??
    key;

describe('report editor Arabic support', () => {
    it('defines every literal worklist key used by the editor', () => {
        const source = [
            resolve(process.cwd(), 'src/pages/ReportEditorPage.jsx'),
            resolve(process.cwd(), 'src/components/reportEditor/ui.jsx')
        ].map((file) => readFileSync(file, 'utf8')).join('\n');

        const keys = [...source.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)]
            .map((match) => match[1])
            .filter((key) => !key.includes(':'));
        const missing = [...new Set(keys)]
            .filter((key) => getTranslation(arWorklist, key) === undefined)
            .sort();

        expect(missing).toEqual([]);
        expect(arWorklist.priorities.Emergency).toBe('طارئ');
        expect(Object.keys(arWorklist.documents.types)).toHaveLength(8);
    });

    it('keeps diagnostic prose LTR inside RTL editor controls', () => {
        const config = {
            key: 'findings',
            icon: 'FileText',
            rows: 4,
            maxLength: 1000,
            required: true
        };

        const { container } = render(
            <div dir="rtl">
                <ReportSectionCard
                    config={config}
                    value="No acute osseous abnormality."
                    editable
                    active
                    onFocus={() => {}}
                    onChange={() => {}}
                    onImprove={() => {}}
                    locale="ar-EG"
                    t={translate}
                />
            </div>
        );

        const reportField = screen.getByRole('textbox');
        expect(reportField).toHaveAttribute('dir', 'ltr');
        expect(reportField).toHaveAttribute('lang', 'en');
        expect(reportField).toHaveClass('text-left');
        expect(container.querySelector('.group')).toHaveClass('border-s-[3px]');
    });
});
