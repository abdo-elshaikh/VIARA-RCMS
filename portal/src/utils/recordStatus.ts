export const isFinalizedRecord = (record: any): boolean =>
  ["Finalized", "Amended"].includes(record?.report_status) &&
  record?.report_locked === true &&
  Boolean(record?.report_finalized_at || record?.finalized_at);
