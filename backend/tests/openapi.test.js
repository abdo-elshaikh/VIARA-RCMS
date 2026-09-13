const express = require('express');
const request = require('supertest');
const fs = require('fs');
const path = require('path');
const docsRoutes = require('../src/routes/docsRoutes');

describe('OpenAPI 3.0.3 Documentation & Specification Suite', () => {
    let app;

    beforeAll(() => {
        app = express();
        app.use('/api/docs', docsRoutes());
    });

    test('serves raw OpenAPI 3.0.3 JSON schema via /api/docs/openapi.json', async () => {
        const res = await request(app)
            .get('/api/docs/openapi.json')
            .expect(200);

        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(res.body).toBeDefined();
        expect(res.body.openapi).toBe('3.0.3');
        expect(res.body.info.title).toContain('VIARA');
        expect(res.body.info.version).toBe('1.0.0');
    });

    test('verifies security schemes defined in components', async () => {
        const res = await request(app)
            .get('/api/docs/openapi.json')
            .expect(200);

        const securitySchemes = res.body.components?.securitySchemes;
        expect(securitySchemes).toBeDefined();
        expect(securitySchemes.BearerAuth).toBeDefined();
        expect(securitySchemes.BearerAuth.type).toBe('http');
        expect(securitySchemes.BearerAuth.scheme).toBe('bearer');
        expect(securitySchemes.ApiKeyAuth).toBeDefined();
        expect(securitySchemes.CsrfToken).toBeDefined();
    });

    test('verifies critical clinical and ERP schemas exist', async () => {
        const res = await request(app)
            .get('/api/docs/openapi.json')
            .expect(200);

        const schemas = res.body.components?.schemas;
        expect(schemas).toBeDefined();
        expect(schemas.Patient).toBeDefined();
        expect(schemas.Appointment).toBeDefined();
        expect(schemas.ExamReport).toBeDefined();
        expect(schemas.SafetyScreening).toBeDefined();
        expect(schemas.Invoice).toBeDefined();
        expect(schemas.ApiResponse).toBeDefined();
        expect(schemas.ErrorResponse).toBeDefined();
    });

    test('verifies core REST paths are registered in specification', async () => {
        const res = await request(app)
            .get('/api/docs/openapi.json')
            .expect(200);

        const paths = res.body.paths;
        expect(paths).toBeDefined();
        expect(paths['/patients']).toBeDefined();
        expect(paths['/appointments']).toBeDefined();
        expect(paths['/invoices']).toBeDefined();
        expect(paths['/exams/{id}/report']).toBeDefined();
        expect(paths['/clinical/safety/{examId}']).toBeDefined();
        expect(paths['/pacs/worklist']).toBeDefined();
        expect(paths['/realtime/stream']).toBeDefined();
    });

    test('serves interactive Swagger UI HTML documentation via /api/docs', async () => {
        const res = await request(app)
            .get('/api/docs')
            .expect(200);

        expect(res.headers['content-type']).toMatch(/text\/html/);
        expect(res.text).toContain('VIARA Enterprise API');
        expect(res.text).toContain('SwaggerUIBundle');
        expect(res.text).toContain('/api/docs/openapi.json');
    });

    test('/api/docs/spec redirects to /api/docs/openapi.json', async () => {
        const res = await request(app)
            .get('/api/docs/spec')
            .expect(302);

        expect(res.headers.location).toBe('/api/docs/openapi.json');
    });

    test('static openapi.json file on disk matches valid JSON syntax', () => {
        const specFile = path.resolve(__dirname, '../src/docs/openapi.json');
        expect(fs.existsSync(specFile)).toBe(true);

        const content = fs.readFileSync(specFile, 'utf8');
        let parsed;
        expect(() => {
            parsed = JSON.parse(content);
        }).not.toThrow();

        expect(parsed.openapi).toBe('3.0.3');
        expect(Object.keys(parsed.paths).length).toBeGreaterThanOrEqual(10);
    });
});
