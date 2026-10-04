const {
    legacyStatus,
    invoiceJournalEntries,
    invoiceAdjustmentEntries,
    mapInputItem,
    applyPrioritySurcharge,
    getDefaultInvoiceSource,
    requireDiscountPermission,
    withInvoiceCommission,
    updateInvoicePaymentStatus,
    recalculateInvoiceAfterItemChange
} = require('../src/services/billingEngineService');
const { AppError } = require('../src/middleware/errorHandler');

describe('billingEngineService', () => {
    describe('getDefaultInvoiceSource', () => {
        test('keeps the booking priority surcharge as a separate invoice line', async () => {
            const client = {
                query: jest.fn().mockResolvedValue({
                    rows: [{
                        appointment_id: 'appointment-1',
                        patient_id: 'patient-1',
                        payment_amount: '500.00',
                        payment_method: 'Cash',
                        priority: 'Urgent',
                        priority_fee_amount: '75.00',
                        exam_id: null,
                        exam_type_id: 'exam-type-1',
                        exam_type_name: 'MRI Brain',
                        price: '500.00',
                    }]
                })
            };

            const source = await getDefaultInvoiceSource(client, { appointmentId: 'appointment-1' });

            expect(source.priorityFeeAmount).toBe(75);
            expect(source.priorityFeeItem).toEqual(expect.objectContaining({
                description: 'Urgent priority surcharge',
                quantity: 1,
                unitPrice: 75,
                totalAmount: 75,
            }));
            expect(source.items).toHaveLength(1);
            expect(source.items[0].description).toBe('MRI Brain');
        });
    });

    describe('legacyStatus', () => {
        test('maps statuses correctly to legacy statuses', () => {
            expect(legacyStatus('Paid')).toBe('Paid');
            expect(legacyStatus('Partial')).toBe('Partial');
            expect(legacyStatus('Refunded')).toBe('Refunded');
            expect(legacyStatus('Pending')).toBe('Pending');
            expect(legacyStatus('Draft')).toBe('Pending');
            expect(legacyStatus('Voided')).toBe('Pending');
            expect(legacyStatus(null)).toBe('Pending');
        });
    });

    describe('mapInputItem', () => {
        test('normalizes input item fields and calculates total amount when omitted', () => {
            const item = {
                unitPrice: '150.50',
                quantity: 2,
                discountAmount: '20.00',
                taxAmount: '15.00',
                examId: '00000000-0000-4000-8000-000000000101',
                examTypeId: '00000000-0000-4000-8000-000000000102'
            };
            const mapped = mapInputItem(item);
            expect(mapped.quantity).toBe(2);
            expect(mapped.unitPrice).toBe(150.5);
            expect(mapped.discountAmount).toBe(20);
            expect(mapped.taxAmount).toBe(15);
            // 2 * 150.50 - 20 + 15 = 301 - 20 + 15 = 296
            expect(mapped.totalAmount).toBe(296);
            expect(mapped.examId).toBe('00000000-0000-4000-8000-000000000101');
            expect(mapped.examTypeId).toBe('00000000-0000-4000-8000-000000000102');
        });

        test('preserves explicitly provided total_amount', () => {
            const item = {
                unit_price: 100,
                quantity: 1,
                total_amount: 85
            };
            const mapped = mapInputItem(item);
            expect(mapped.totalAmount).toBe(85);
            expect(mapped.unitPrice).toBe(100);
        });
    });

    describe('applyPrioritySurcharge', () => {
        test('keeps exactly one server-priced priority surcharge with custom invoice items', () => {
            const items = [
                { description: 'MRI Brain', unitPrice: 500, totalAmount: 500 },
                { description: 'Urgent priority surcharge', unitPrice: 1, totalAmount: 1 },
            ];
            const priorityFeeItem = {
                description: 'Urgent priority surcharge',
                quantity: 1,
                unitPrice: 75,
                totalAmount: 75,
                itemType: 'PrioritySurcharge',
            };

            const result = applyPrioritySurcharge(items, priorityFeeItem);

            expect(result).toHaveLength(2);
            expect(result[0]).toBe(items[0]);
            expect(result[1]).toBe(priorityFeeItem);
        });

        test('removes client priority-fee lines when the configured fee is zero', () => {
            const result = applyPrioritySurcharge([
                { description: 'Emergency priority surcharge', unitPrice: 900, totalAmount: 900 },
                { description: 'CT Chest', unitPrice: 250, totalAmount: 250 },
            ], null);

            expect(result).toEqual([{ description: 'CT Chest', unitPrice: 250, totalAmount: 250 }]);
        });
    });

    describe('invoiceJournalEntries', () => {
        test('generates balanced journal entries and filters out zero lines', () => {
            const patientId = '00000000-0000-4000-8000-000000000001';
            const values = {
                patientPayable: 80,
                insurance: 20,
                discount: 10,
                subtotal: 100,
                tax: 10,
                commission: 5,
                doctorId: '00000000-0000-4000-8000-000000000002'
            };
            const entries = invoiceJournalEntries(values, patientId);
            expect(entries.length).toBe(7);

            const totalDebit = entries.reduce((acc, e) => acc + e.debit, 0);
            const totalCredit = entries.reduce((acc, e) => acc + e.credit, 0);
            // Debits: 80 (receivables) + 20 (insurance) + 10 (discount) + 5 (commission expense) = 115
            // Credits: 100 (revenue) + 10 (tax) + 5 (commission payable) = 115
            expect(totalDebit).toBe(115);
            expect(totalCredit).toBe(115);
        });

        test('excludes zero entries when amounts are 0', () => {
            const patientId = '00000000-0000-4000-8000-000000000001';
            const values = {
                patientPayable: 100,
                insurance: 0,
                discount: 0,
                subtotal: 100,
                tax: 0,
                commission: 0,
                doctorId: null
            };
            const entries = invoiceJournalEntries(values, patientId);
            expect(entries.length).toBe(2);
            expect(entries.find(e => e.accountCode === '1100').debit).toBe(100);
            expect(entries.find(e => e.accountCode === '4000').credit).toBe(100);
        });
    });

    describe('invoiceAdjustmentEntries', () => {
        test('returns empty array when there is no financial change', () => {
            const patientId = '00000000-0000-4000-8000-000000000001';
            const state = {
                patientPayable: 100,
                insurance: 0,
                discount: 0,
                subtotal: 100,
                tax: 0,
                commission: 0
            };
            const adjustments = invoiceAdjustmentEntries(state, state, patientId);
            expect(adjustments).toEqual([]);
        });

        test('generates accurate adjustment entries when amounts change', () => {
            const patientId = '00000000-0000-4000-8000-000000000001';
            const before = {
                patientPayable: 100,
                insurance: 0,
                discount: 0,
                subtotal: 100,
                tax: 0,
                commission: 0
            };
            const after = {
                patientPayable: 120,
                insurance: 0,
                discount: 0,
                subtotal: 120,
                tax: 0,
                commission: 0
            };
            const adjustments = invoiceAdjustmentEntries(before, after, patientId);
            expect(adjustments.length).toBe(2);
            const debits = adjustments.reduce((sum, e) => sum + e.debit, 0);
            const credits = adjustments.reduce((sum, e) => sum + e.credit, 0);
            expect(debits).toBe(20);
            expect(credits).toBe(20);
        });
    });

    describe('requireDiscountPermission', () => {
        test('allows Developer role unconditionally', async () => {
            const client = { query: jest.fn() };
            await expect(requireDiscountPermission(client, { role: 'Developer' })).resolves.toBeUndefined();
            expect(client.query).not.toHaveBeenCalled();
        });

        test('throws 403 when user lacks APPLY_DISCOUNTS permission', async () => {
            const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
            await expect(requireDiscountPermission(client, { role: 'Cashier' }))
                .rejects.toThrow(AppError);
        });

        test('resolves when user has APPLY_DISCOUNTS permission', async () => {
            const client = { query: jest.fn().mockResolvedValue({ rows: [{ exists: 1 }] }) };
            await expect(requireDiscountPermission(client, { role: 'Accountant' }))
                .resolves.toBeUndefined();
        });
    });

    describe('withInvoiceCommission', () => {
        test('computes doctor commission percentage when doctor exists', async () => {
            const client = {
                query: jest.fn().mockResolvedValue({
                    rows: [{ doctor_id: 'doc-1', commission_percentage: '15.00' }]
                })
            };
            const values = { subtotal: '200.00', discount: '20.00' };
            const result = await withInvoiceCommission(client, 'inv-1', values);
            expect(result.doctorId).toBe('doc-1');
            // (200 - 20) * 0.15 = 27
            expect(result.commission).toBe(27);
        });

        test('returns 0 commission and null doctorId if no doctor associated', async () => {
            const client = {
                query: jest.fn().mockResolvedValue({ rows: [] })
            };
            const values = { subtotal: '100.00', discount: '0' };
            const result = await withInvoiceCommission(client, 'inv-1', values);
            expect(result.doctorId).toBeNull();
            expect(result.commission).toBe(0);
        });
    });

    describe('updateInvoicePaymentStatus', () => {
        test('returns null if invoice does not exist', async () => {
            const client = {
                query: jest.fn()
                    .mockResolvedValueOnce({ rows: [] })
                    .mockResolvedValueOnce({ rows: [] })
            };
            const result = await updateInvoicePaymentStatus(client, 'inv-null');
            expect(result).toBeNull();
        });

        test('marks invoice as Refunded when refunded_amount matches payable', async () => {
            const calls = [];
            const client = {
                query: jest.fn(async (sql, params = []) => {
                    const text = String(sql);
                    calls.push({ text, params });
                    if (text.includes('WITH totals AS')) {
                        return {
                            rows: [{
                                patient_payable_amount: '100.00',
                                paid_amount: '100.00',
                                refunded_amount: '100.00',
                                credited_amount: '100.00'
                            }]
                        };
                    }
                    if (text.includes('UPDATE invoices')) {
                        return { rows: [{ invoice_id: params[2], invoice_status: params[0], status: params[1] }] };
                    }
                    return { rows: [] };
                })
            };

            const updated = await updateInvoicePaymentStatus(client, 'inv-ref');
            expect(updated.invoice_status).toBe('Refunded');
            expect(updated.status).toBe('Refunded');
        });

        test('marks invoice as Partial when net paid is less than payable', async () => {
            const client = {
                query: jest.fn(async (sql, params = []) => {
                    const text = String(sql);
                    if (text.includes('WITH totals AS')) {
                        return {
                            rows: [{
                                patient_payable_amount: '100.00',
                                paid_amount: '50.00',
                                refunded_amount: '0',
                                credited_amount: '0'
                            }]
                        };
                    }
                    if (text.includes('UPDATE invoices')) {
                        return { rows: [{ invoice_id: params[2], invoice_status: params[0], status: params[1] }] };
                    }
                    return { rows: [] };
                })
            };

            const updated = await updateInvoicePaymentStatus(client, 'inv-partial');
            expect(updated.invoice_status).toBe('Partial');
            expect(updated.status).toBe('Partial');
        });
    });

    describe('recalculateInvoiceAfterItemChange', () => {
        test('throws 404 AppError if invoice is missing or voided', async () => {
            const client = {
                query: jest.fn().mockResolvedValueOnce({ rows: [{ invoice_status: 'Voided' }] })
            };
            await expect(recalculateInvoiceAfterItemChange(client, 'inv-void', 'user-1'))
                .rejects.toThrow('Active invoice not found');
        });
    });
});
