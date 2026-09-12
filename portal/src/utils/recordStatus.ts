export const isFinalizedRecord = (record: any): boolean =>
  record?.exam_status === "Finalized" ||
  ["Finalized", "Amended"].includes(record?.report_status) ||
  record?.report_locked === true;
