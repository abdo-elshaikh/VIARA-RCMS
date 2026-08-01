const { z } = require('zod');

const deliveryMethodSchema = z.enum([
    'Printed',
    'Email',
    'SMS Link',
    'WhatsApp Link',
    'Patient Portal',
    'Doctor Portal',
    'Physical Pickup'
]);

const deliveryStatusSchema = z.enum([
    'Pending',
    'Sent',
    'Delivered',
    'Failed',
    'Acknowledged',
    'Picked Up',
    'Accessed',
    'Printed'
]);

const deliverResultSchema = z.object({
    deliveryMethod: deliveryMethodSchema,
    recipientName: z.string().trim().max(150).optional(),
    recipientContact: z.string().trim().max(150).optional(),
    deliveryStatus: deliveryStatusSchema.optional(),
    printCopyCount: z.coerce.number().int().min(0).optional(),
    acknowledgedByName: z.string().trim().max(150).optional(),
    notes: z.string().trim().max(1000).optional()
});

module.exports = {
    deliverResultSchema
};
