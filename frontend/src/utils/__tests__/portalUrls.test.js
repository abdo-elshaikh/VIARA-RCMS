import { afterEach, describe, expect, it } from 'vitest';
import { getPatientPortalLoginUrl, getDoctorPortalDashboardUrl } from '../portalUrls';

afterEach(() => { delete window.__VIARA_CONFIG__; });
describe('customer runtime portal origin', () => {
    it('uses the deployment origin for patient links without rebuilding', () => {
        window.__VIARA_CONFIG__ = { portalPublicUrl: 'https://patients.example.test/' };
        expect(getPatientPortalLoginUrl()).toBe('https://patients.example.test/patient/login');
    });
    it('reflects a changed site origin for referring doctor links', () => {
        window.__VIARA_CONFIG__ = { portalPublicUrl: 'https://first.example.test' };
        expect(getDoctorPortalDashboardUrl()).toBe('https://first.example.test/doctor/dashboard');
        window.__VIARA_CONFIG__.portalPublicUrl = 'https://second.example.test';
        expect(getDoctorPortalDashboardUrl()).toBe('https://second.example.test/doctor/dashboard');
    });
});
