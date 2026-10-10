import { z } from "zod";

const SERVICES = [
  {
    slug: "mri-3t",
    name: "MRI 3T",
    category: "Magnetic resonance",
    description:
      "High-field 3 Tesla magnetic resonance imaging for neurological, musculoskeletal, and body studies.",
    turnaroundHours: 24,
  },
  {
    slug: "low-dose-ct",
    name: "Low-dose CT",
    category: "Computed tomography",
    description:
      "Dose-conscious computed tomography protocols including cardiac, chest, and oncology follow-up.",
    turnaroundHours: 24,
  },
  {
    slug: "digital-x-ray",
    name: "Digital X-Ray",
    category: "Radiography",
    description: "Digital radiography with immediate image capture and same-day reporting.",
    turnaroundHours: 6,
  },
  {
    slug: "4d-ultrasound",
    name: "4D Ultrasound",
    category: "Ultrasound",
    description: "Obstetric, vascular, and general ultrasound including 4D fetal imaging.",
    turnaroundHours: 4,
  },
  {
    slug: "cardiac-imaging",
    name: "Cardiac imaging",
    category: "Cardiology",
    description: "Cardiac MRI, CT angiography, and echocardiography with specialist reporting.",
    turnaroundHours: 24,
  },
  {
    slug: "interventional-radiology",
    name: "Interventional radiology",
    category: "Intervention",
    description: "Minimally invasive image-guided procedures performed by consultant radiologists.",
    turnaroundHours: 48,
  },
];

export const listServicesTool = {
  name: "list_services",
  title: "List diagnostic services",
  description:
    "List the diagnostic imaging services offered by the VIARA radiology center, optionally filtered by category.",
  inputSchema: {
    category: z
      .string()
      .optional()
      .describe("Optional case-insensitive category filter, e.g. 'ultrasound' or 'cardiology'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ category }: { category?: string }) => {
    const filtered = category
      ? SERVICES.filter((s) => s.category.toLowerCase().includes(category.toLowerCase()))
      : SERVICES;
    return {
      content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }],
      structuredContent: { services: filtered },
    };
  },
};
