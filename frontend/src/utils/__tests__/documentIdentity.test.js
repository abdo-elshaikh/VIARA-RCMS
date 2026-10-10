import { describe, expect, it } from 'vitest';
import {
    buildDocumentHeader,
    createIdentitySnapshot,
    resolveDocumentIdentity
} from '../documentIdentity';

describe('document identity resolver', () => {
    const organization = {
        center_id: 'center-1',
        center_name: 'Cairo Scan',
        center_name_ar: 'كايرو سكان',
        logo_url: '/logos/cairo-scan.svg',
        address: '10 Tahrir St, Cairo',
        address_ar: '١٠ شارع التحرير، القاهرة',
        phone: '+20 2 1234 5678',
        email: 'care@cairoscan.example',
        tax_id: 'TAX-100',
        medical_license: 'MED-100',
        footer_text: 'Thank you for choosing Cairo Scan'
    };

    it('uses organization identity when the document has no branch overrides', () => {
        const identity = resolveDocumentIdentity(organization);

        expect(identity.centerName).toBe('Cairo Scan');
        expect(identity.branchName).toBe('');
        expect(identity.logoUrl).toBe('/logos/cairo-scan.svg');
        expect(identity.taxNumber).toBe('TAX-100');
    });

    it('lets the originating document branch override inherited organization values', () => {
        const identity = resolveDocumentIdentity(organization, {
            branch_id: 'branch-b',
            branch_name: 'Nasr City Branch',
            branch_address: '15 Abbas El Akkad, Nasr City',
            branch_phone: '+20 2 9000 0000',
            branch_tax_id: 'TAX-BRANCH-B'
        });

        expect(identity.displayName).toBe('Cairo Scan - Nasr City Branch');
        expect(identity.address).toBe('15 Abbas El Akkad, Nasr City');
        expect(identity.phone).toBe('+20 2 9000 0000');
        expect(identity.taxNumber).toBe('TAX-BRANCH-B');
    });

    it('prefers historical snapshots over current center settings for finalized documents', () => {
        const identity = resolveDocumentIdentity({
            ...organization,
            center_name: 'Cairo Scan New Name',
            address: 'New HQ'
        }, {
            organization_snapshot: {
                center_name: 'Cairo Scan Historical',
                branch_name: 'Heliopolis Branch',
                address: 'Old Heliopolis Address',
                tax_id: 'OLD-TAX'
            }
        });

        expect(identity.displayName).toBe('Cairo Scan Historical - Heliopolis Branch');
        expect(identity.address).toBe('Old Heliopolis Address');
        expect(identity.taxNumber).toBe('OLD-TAX');
    });

    it('uses Arabic names and addresses when Arabic output is requested', () => {
        const identity = resolveDocumentIdentity(organization, {
            branch_name: 'Main Branch',
            branch_name_ar: 'الفرع الرئيسي'
        }, { language: 'ar-EG' });

        expect(identity.displayName).toBe('كايرو سكان - الفرع الرئيسي');
        expect(identity.address).toBe('١٠ شارع التحرير، القاهرة');
        expect(buildDocumentHeader(identity, {}, { language: 'ar-EG' })).toContain('كايرو سكان');
    });

    it('creates a compact snapshot suitable for finalized reports and invoices', () => {
        const snapshot = createIdentitySnapshot(organization, {
            branch_name: 'Dokki Branch',
            branch_phone: '+20 2 7000 0000'
        });

        expect(snapshot).toMatchObject({
            centerName: 'Cairo Scan',
            branchName: 'Dokki Branch',
            phone: '+20 2 7000 0000',
            taxNumber: 'TAX-100'
        });
    });
});
