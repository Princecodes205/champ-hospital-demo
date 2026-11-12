export const formatNaira = (naira: number) => {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
  }).format(naira);
};

// Parses a naira amount entered by the user (e.g. "4000") for storage.
// Returns 0 for empty/invalid input. All money is stored in naira (whole units).
export const parseNaira = (value: string): number => {
  const num = parseFloat(value);
  if (isNaN(num) || num < 0) return 0;
  return Math.round(num);
};

export const formatDateTime = (dateString: string) => {
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Lagos',
  }).format(new Date(dateString));
};
