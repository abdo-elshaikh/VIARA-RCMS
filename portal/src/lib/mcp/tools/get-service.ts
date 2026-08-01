import { z } from "zod";

const DETAILS: Record<
  string,
  { name: string; preparation: string; duration: string; turnaround: string; notes: string }
> = {
  "mri-3t": {
    name: "MRI 3T",
    preparation: "Remove all metal objects. Fast for 4 hours if contrast is required.",
    duration: "30–60 minutes depending on protocol.",
    turnaround: "Specialist-signed report within 24 hours.",
    notes: "Not suitable for patients with non-MRI-safe implants; call ahead to confirm.",
  },
  "low-dose-ct": {
    name: "Low-dose CT",
    preparation: "Fast 4 hours for contrast studies. Wear loose clothing without metal fasteners.",
    duration: "10–20 minutes.",
    turnaround: "Report within 24 hours; urgent findings called through immediately.",
    notes: "ALARA dose-optimised protocols on modern multidetector scanner.",
  },
  "digital-x-ray": {
    name: "Digital X-Ray",
    preparation: "No preparation required for most studies.",
    duration: "5–10 minutes.",
    turnaround: "Same-day report, most within 6 hours.",
    notes: "Walk-in availability during clinic hours.",
  },
  "4d-ultrasound": {
    name: "4D Ultrasound",
    preparation:
      "Obstetric: full bladder for early pregnancy scans. Abdominal: fast 6 hours. Vascular: none.",
    duration: "20–40 minutes.",
    turnaround: "Report within 4 hours.",
    notes: "Includes take-home images for obstetric studies.",
  },
  "cardiac-imaging": {
    name: "Cardiac imaging",
    preparation:
      "Avoid caffeine 12 hours before stress imaging. Continue routine medication unless advised.",
    duration: "45–90 minutes.",
    turnaround: "Cardiology-signed report within 24 hours.",
    notes: "Includes cardiac MRI, CT coronary angiography, and echocardiography.",
  },
  "interventional-radiology": {
    name: "Interventional radiology",
    preparation:
      "Pre-procedure consultation required. Fasting and blood-work instructions provided at booking.",
    duration: "Varies by procedure, typically 30–120 minutes.",
    turnaround: "Procedure report same day; follow-up imaging as scheduled.",
    notes: "Day-case suite with recovery bay and consultant supervision.",
  },
};

export const getServiceTool = {
  name: "get_service_details",
  title: "Get service details",
  description:
    "Get preparation, duration, and turnaround details for a specific diagnostic service by its slug.",
  inputSchema: {
    slug: z
      .string()
      .min(1)
      .describe("Service slug from list_services, e.g. 'mri-3t' or 'digital-x-ray'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ slug }: { slug: string }) => {
    const detail = DETAILS[slug.toLowerCase()];
    if (!detail) {
      return {
        content: [{ type: "text", text: `No service found for slug '${slug}'.` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(detail, null, 2) }],
      structuredContent: detail,
    };
  },
};
