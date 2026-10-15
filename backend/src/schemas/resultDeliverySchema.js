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

const providerConfirmedChannels = ['Email', 'SMS Link', 'WhatsApp Link', 'Patient Portal', 'Doctor Portal'];

const deliverResultSchema = z.object({
    deliveryMethod: deliveryMethodSchema,
    resultType: z.enum(['Images', 'Report', 'ImagesAndReport']).default('Report'),
    recipientName: z.string().trim().max(150).optional(),
    recipientContact: z.string().trim().max(150).optional(),
    deliveryStatus: deliveryStatusSchema.optional(),
    printCopyCount: z.coerce.number().int().min(0).optional(),
    acknowledgedByName: z.string().trim().max(150).optional(),
    notes: z.string().trim().max(1000).optional()
}).superRefine((data, context) => {
    if (data.deliveryMethod === 'Physical Pickup') {
        if (!data.recipientName) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['recipientName'],
                message: 'Recipient name is required for physical pickup'
            });
        }

        if (!data.acknowledgedByName) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['acknowledgedByName'],
                message: 'Acknowledged by name is required for physical pickup'
            });
        }
    }

    if (['Acknowledged', 'Picked Up'].includes(data.deliveryStatus) && !data.acknowledgedByName) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['acknowledgedByName'],
            message: 'Acknowledged by name is required for acknowledged deliveries'
        });
    }

    if (providerConfirmedChannels.includes(data.deliveryMethod) && data.deliveryStatus !== undefined) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['deliveryStatus'],
            message: 'Electronic delivery status is assigned by the delivery workflow, not by the requester'
        });
    }
});

module.exports = {
    deliverResultSchema
};
