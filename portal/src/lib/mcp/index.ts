import { getContactTool } from "./tools/get-contact";
import { getServiceTool } from "./tools/get-service";
import { listFaqTool } from "./tools/list-faq";
import { listServicesTool } from "./tools/list-services";
import { listSpecialistsTool } from "./tools/list-specialists";

const RCMS_MCP = {
  name: "rcms-radiology-mcp",
  title: "RCMS Radiology",
  version: "0.1.0",
  instructions:
    "Public catalog for the RCMS Radiology center. Use list_services and get_service_details for diagnostic services (MRI, CT, X-Ray, ultrasound, cardiac, interventional). Use list_specialists for consultant radiologists, list_faq for common questions, and get_contact_info for hours, phone, and portal links.",
  tools: [listServicesTool, getServiceTool, listSpecialistsTool, listFaqTool, getContactTool],
};

export default RCMS_MCP;
