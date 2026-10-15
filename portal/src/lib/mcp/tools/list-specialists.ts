import { z } from "zod";

const SPECIALISTS = [
  {
    id: "AF",
    name: "Dr. Amelia Farouk",
    focus: "Neuroradiology",
    credentials: "MD, FRCR",
    bio: "Consultant neuroradiologist with 15 years of experience in advanced brain and spine imaging.",
  },
  {
    id: "KE",
    name: "Dr. Karim El-Sayed",
    focus: "Cardiac imaging",
    credentials: "MD, EACVI",
    bio: "Cardiac imaging lead specialising in coronary CT angiography and cardiac MRI.",
  },
  {
    id: "LH",
    name: "Dr. Lin Hui",
    focus: "Musculoskeletal",
    credentials: "MD, MSK Fellowship",
    bio: "Musculoskeletal radiologist covering sports injury, arthropathy, and image-guided injections.",
  },
  {
    id: "ON",
    name: "Dr. Omar Nasser",
    focus: "Interventional radiology",
    credentials: "MD, EBIR",
    bio: "Interventional radiologist performing vascular, oncologic, and pain-management procedures.",
  },
];

export const listSpecialistsTool = {
  name: "list_specialists",
  title: "List specialists",
  description: "List the consultant radiologists at VIARA, optionally filtered by clinical focus.",
  inputSchema: {
    focus: z
      .string()
      .optional()
      .describe("Optional case-insensitive filter on clinical focus, e.g. 'cardiac'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ focus }: { focus?: string }) => {
    const items = focus
      ? SPECIALISTS.filter((s) => s.focus.toLowerCase().includes(focus.toLowerCase()))
      : SPECIALISTS;
    return {
      content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
      structuredContent: { specialists: items },
    };
  },
};
