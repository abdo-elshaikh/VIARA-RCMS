const fs = require('fs');
const path = require('path');
const { renderTemplate } = require('../src/services/notificationService');
const {
    activeTemplates,
    catalogEvents,
    renderCases,
    requiredRolePolicies
} = require('./notification-contract.fixture');

const backendRoot = path.join(__dirname, '..');
const sourceRoot = path.join(backendRoot, 'src');
const migrationsRoot = path.join(backendRoot, '..', 'database', 'migrations');

const readJavaScriptFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return readJavaScriptFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.js') ? [fs.readFileSync(entryPath, 'utf8')] : [];
});

const migrationSql = fs.readdirSync(migrationsRoot)
    .filter(filename => filename.endsWith('.sql'))
    .map(filename => fs.readFileSync(path.join(migrationsRoot, filename), 'utf8'))
    .join('\n');
const catalogSql = migrationSql;
const contractMigration = fs.readFileSync(path.join(migrationsRoot, '123_notification_contract_fixes.sql'), 'utf8');
const sourceText = readJavaScriptFiles(sourceRoot).join('\n');

const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const extractTriggeredEvents = () => new Set(
    [...sourceText.matchAll(/\btriggerEvent(?:ForRole)?\s*\(\s*db\s*,\s*['"]([^'"]+)['"]/g)]
        .map(match => match[1])
);
const extractLiteralRoleTriggers = () => [
    ...sourceText.matchAll(/\btriggerEventForRole\s*\(\s*db\s*,\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/g)
].map(match => [match[1], match[2]]);

describe('notification event/template/policy contract', () => {
    test('all literal backend trigger events are present in the maintained catalog fixture and catalog seeds', () => {
        const fixtureEvents = new Set(catalogEvents);
        const triggeredEvents = extractTriggeredEvents();

        expect([...triggeredEvents].filter(event => !fixtureEvents.has(event))).toEqual([]);
        expect(catalogEvents).toEqual(expect.arrayContaining([
            'ManualSend', 'ManualReminder', 'MarketingCampaign'
        ]));
        for (const event of fixtureEvents) {
            expect(catalogSql).toMatch(new RegExp(`\\('${escapeRegex(event)}'\\s*,`));
        }
    });

    test('all requested and policy channels have seeded, explicitly active English templates', () => {
        for (const [event, channels] of Object.entries(activeTemplates)) {
            for (const channel of channels) {
                const pair = `\\(\\s*'${escapeRegex(event)}'\\s*,\\s*'${channel}'`;
                expect(migrationSql).toMatch(new RegExp(pair));
            }
        }
        expect(contractMigration).toContain('WITH active_contract(event_type, channel) AS (VALUES');
        expect(migrationSql).toContain('is_active = TRUE');
    });

    test('focused role triggers have explicit audience policies', () => {
        const policyPairs = [...requiredRolePolicies, ...extractLiteralRoleTriggers()];
        for (const [event, role] of policyPairs) {
            expect(migrationSql).toMatch(new RegExp(
                `\\('${escapeRegex(event)}'\\s*,\\s*NULL\\s*,\\s*'${escapeRegex(role)}'`
            ));
        }
    });

    test('seeded templates use only simple placeholders and render expected values', () => {
        expect(contractMigration).not.toMatch(/\{\{[^}\n]*(?:#|\/|\|\||\?\?|\[|\(|\.)[^}\n]*\}\}/);
        expect(contractMigration).toContain("('LOGIN_FAILED', 'InApp', 'en', 'Failed Login Attempt', 'A failed login attempt was detected. IP: {{ip_address}} User: {{user_email}} Reason: {{reason}}'");
        expect(contractMigration).toContain("('AppointmentRequestReviewed', 'Email', 'en', 'Appointment Request Update', 'Your appointment request has been reviewed. Status: {{status}} Notes: {{staff_notes}}'");

        for (const { template, variables, expected } of renderCases) {
            const rendered = renderTemplate(template, variables);
            expect(rendered).toBe(expected);
            expect(rendered).not.toMatch(/\{\{[^}]+\}\}/);
        }
    });

    test('supply charge dispatch has event/role arguments in the correct order for both finance roles', () => {
        const inventoryController = fs.readFileSync(
            path.join(sourceRoot, 'controllers', 'inventoryController.js'),
            'utf8'
        );
        expect(inventoryController).toContain("triggerEventForRole(db, 'SUPPLY_ADDED_PAYMENT_DUE', 'Accountant'");
        expect(inventoryController).toContain("triggerEventForRole(db, 'SUPPLY_ADDED_PAYMENT_DUE', 'Cashier'");
        expect(inventoryController).not.toContain("triggerEventForRole(db, 'Accountant', 'SUPPLY_ADDED_PAYMENT_DUE'");
        expect(inventoryController.indexOf("await client.query('COMMIT')"))
            .toBeLessThan(inventoryController.indexOf("triggerEventForRole(db, 'SUPPLY_ADDED_PAYMENT_DUE'"));
    });

    test('payment success emits PaymentReceived only after commit', () => {
        const invoiceController = fs.readFileSync(
            path.join(sourceRoot, 'controllers', 'invoiceController.js'),
            'utf8'
        );
        const paymentTrigger = invoiceController.indexOf("triggerEvent(db, 'PaymentReceived'");
        expect(paymentTrigger).toBeGreaterThan(invoiceController.lastIndexOf("await client.query('COMMIT')", paymentTrigger));
        expect(invoiceController).toContain("triggerEventForRole(db, 'PaymentReceived', 'Cashier'");
        expect(invoiceController).toContain("triggerEventForRole(db, 'PaymentReceived', 'Accountant'");
        expect(invoiceController).toContain("triggerEventForRole(db, 'PaymentReceived', 'Admin'");
    });
});
