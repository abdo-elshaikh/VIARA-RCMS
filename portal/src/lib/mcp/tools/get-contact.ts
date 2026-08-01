const CONTACT = {
  name: "RCMS Radiology",
  tagline: "Modern diagnostic imaging center",
  hours: {
    weekdays: "Sunday–Thursday, 08:00–22:00",
    weekend: "Friday–Saturday, 09:00–18:00",
    emergency: "24/7 on-call radiologist for referring physicians",
  },
  contact: {
    appointments: "+1 (555) 010-2200",
    referrals: "referrals@rcms.example",
    general: "hello@rcms.example",
  },
  portals: {
    patient: "/patient",
    doctor: "/doctor",
  },
  languages: ["English", "Arabic"],
  reportTurnaroundHours: 24,
};

export const getContactTool = {
  name: "get_contact_info",
  title: "Get contact information",
  description:
    "Get RCMS Radiology contact details, opening hours, portal links, and supported languages.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => ({
    content: [{ type: "text", text: JSON.stringify(CONTACT, null, 2) }],
    structuredContent: CONTACT,
  }),
};
