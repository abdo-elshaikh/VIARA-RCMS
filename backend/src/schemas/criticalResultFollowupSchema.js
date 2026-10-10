const { z } = require('zod');

const completeCriticalResultFollowupSchema = z.object({
    contactedParty: z.string().trim().min(2).max(160),
    followUpNotes: z.string().trim().min(10).max(2000)
});

module.exports = { completeCriticalResultFollowupSchema };
