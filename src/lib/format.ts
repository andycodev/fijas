const money = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
const date = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

export const formatMoney = (n: number) => money.format(n);
export const formatDate = (iso: string) => date.format(new Date(`${iso}T00:00:00Z`));
