import { z } from "zod";

const FAQ = [
  {
    q: "How do I book an appointment?",
    a: "Book online through the patient portal, call the clinic, or ask your referring doctor to send a request.",
  },
  {
    q: "How quickly will I receive my report?",
    a: "Most reports are specialist-signed and delivered within 24 hours. Digital X-Ray reports are typically ready the same day.",
  },
  {
    q: "Is my data secure?",
    a: "All patient records, images, and messages are encrypted end-to-end and stored under HIPAA-grade controls.",
  },
  {
    q: "Do you accept insurance?",
    a: "Yes. We are insurance-ready and work with most major providers. Bring your insurance card to the appointment.",
  },
  {
    q: "What languages do you support?",
    a: "The portal and reports are available in Arabic and English. Multilingual staff are on site.",
  },
  {
    q: "Can referring doctors access reports directly?",
    a: "Yes. Referring doctors receive portal access to track cases, download reports, and message the reading radiologist.",
  },
];

export const listFaqTool = {
  name: "list_faq",
  title: "List frequently asked questions",
  description:
    "List the RCMS radiology center's frequently asked questions, optionally filtered by keyword.",
  inputSchema: {
    keyword: z
      .string()
      .optional()
      .describe("Optional case-insensitive keyword to filter question/answer text."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ keyword }: { keyword?: string }) => {
    const items = keyword
      ? FAQ.filter((f) => `${f.q} ${f.a}`.toLowerCase().includes(keyword.toLowerCase()))
      : FAQ;
    return {
      content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
      structuredContent: { faq: items },
    };
  },
};
