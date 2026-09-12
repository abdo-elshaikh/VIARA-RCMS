export const todayLocalISO = (): string => {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().split("T")[0];
};

export const isPastDate = (value?: string | null): boolean => {
  if (!value) return false;
  return value < todayLocalISO();
};
