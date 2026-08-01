/**
 * RCMS Radiology - Word Report (.docx / .doc) Export Utility
 * Generates an official radiology report document readable natively by Microsoft Word.
 */

export interface ExportReportData {
  examId?: string;
  orderNumber?: string;
  patientName?: string;
  patientMrn?: string;
  examTitle?: string;
  modality?: string;
  date?: string;
  radiologistName?: string;
  clinicalIndication?: string;
  findings?: string;
  impression?: string;
  centerName?: string;
  centerPhone?: string;
  centerAddress?: string;
}

export function exportReportToWord(data: ExportReportData) {
  const centerName = data.centerName || "RCMS Radiology Center";
  const centerPhone = data.centerPhone || "+1 (555) 010-2200";
  const centerAddress = data.centerAddress || "100 Medical Parkway, Diagnostic Tower, 4th Floor";
  const dateStr = data.date || new Date().toLocaleDateString();

  const docHtml = `
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset='utf-8'>
  <title>Radiology Report - ${data.patientName || "Patient"}</title>
  <style>
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      color: #0f172a;
      line-height: 1.6;
      margin: 40px;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      border-bottom: 3px solid #0891b2;
      padding-bottom: 12px;
      margin-bottom: 24px;
    }
    .center-title {
      font-size: 22px;
      font-weight: bold;
      color: #0e7490;
      margin: 0;
    }
    .center-sub {
      font-size: 11px;
      color: #64748b;
      margin: 2px 0 0 0;
    }
    .patient-table {
      width: 100%;
      border-collapse: collapse;
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      margin-bottom: 24px;
      font-size: 13px;
    }
    .patient-table td {
      padding: 8px 12px;
      border: 1px solid #e2e8f0;
    }
    .label {
      font-weight: bold;
      color: #475569;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .val {
      color: #0f172a;
      font-weight: 600;
    }
    .section-header {
      font-size: 12px;
      font-weight: bold;
      color: #0e7490;
      text-transform: uppercase;
      letter-spacing: 1px;
      border-bottom: 1.5px solid #cbd5e1;
      padding-bottom: 4px;
      margin-top: 20px;
      margin-bottom: 8px;
    }
    .section-content {
      font-size: 13px;
      color: #334155;
      margin-bottom: 16px;
      white-space: pre-wrap;
    }
    .sign-table {
      width: 100%;
      margin-top: 40px;
      border-top: 2px solid #e2e8f0;
      padding-top: 16px;
    }
    .badge {
      display: inline-block;
      background-color: #dcfce7;
      color: #166534;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: bold;
    }
    .footer-note {
      font-size: 10px;
      color: #94a3b8;
      text-align: center;
      margin-top: 40px;
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
    }
  </style>
</head>
<body>
  <table class="header-table">
    <tr>
      <td>
        <h1 class="center-title">${centerName}</h1>
        <p class="center-sub">${centerAddress} · Tel: ${centerPhone}</p>
      </td>
      <td style="text-align: right;">
        <span class="badge">OFFICIAL FINAL REPORT</span>
        <p style="font-size: 11px; color: #64748b; margin-top: 4px;">Date: ${dateStr}</p>
      </td>
    </tr>
  </table>

  <table class="patient-table">
    <tr>
      <td width="20%"><span class="label">Patient Name</span></td>
      <td width="30%"><span class="val">${data.patientName || "N/A"}</span></td>
      <td width="20%"><span class="label">MRN Number</span></td>
      <td width="30%"><span class="val">${data.patientMrn || "N/A"}</span></td>
    </tr>
    <tr>
      <td><span class="label">Examination</span></td>
      <td><span class="val">${data.examTitle || "Radiology Scan"}</span></td>
      <td><span class="label">Modality</span></td>
      <td><span class="val">${data.modality || "MRI"}</span></td>
    </tr>
    <tr>
      <td><span class="label">Order Number</span></td>
      <td><span class="val">${data.orderNumber || data.examId || "ORD-001"}</span></td>
      <td><span class="label">Report Status</span></td>
      <td><span class="val" style="color: #047857;">Finalized & Signed</span></td>
    </tr>
  </table>

  ${data.clinicalIndication ? `
  <div class="section-header">Clinical Indication</div>
  <div class="section-content">${data.clinicalIndication}</div>
  ` : ""}

  <div class="section-header">Radiology Findings & Impression</div>
  <div class="section-content">${data.findings || data.impression || "Final specialist diagnostic findings documented and confirmed."}</div>

  <table class="sign-table">
    <tr>
      <td width="60%">
        <p style="font-size: 11px; color: #64748b; margin: 0;">Electronically Verified & Authenticated</p>
        <p style="font-size: 13px; font-weight: bold; color: #0f172a; margin: 4px 0 0 0;">Dr. ${data.radiologistName || "Assigned Consultant Radiologist"}</p>
        <p style="font-size: 11px; color: #0891b2; margin: 0;">Consultant Radiologist, RCMS Diagnostic Imaging</p>
      </td>
      <td width="40%" style="text-align: right;">
        <span class="badge">VERIFIED & RELEASED</span>
      </td>
    </tr>
  </table>

  <div class="footer-note">
    Confidential Medical Record — Released under RCMS Security Protocols. Authorized clinical use only.
  </div>
</body>
</html>
  `;

  const blob = new Blob(["\ufeff", docHtml], {
    type: "application/msword",
  });

  const filename = `${data.patientMrn || "Report"}_${(data.examTitle || "Scan").replace(/\s+/g, "_")}.doc`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
