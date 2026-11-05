let money = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });

// La moneda sale del perfil (por defecto, soles). Un código inválido se ignora y se mantiene el anterior.
export function setCurrency(code: string): void {
  try { money = new Intl.NumberFormat('es-PE', { style: 'currency', currency: code }); } catch { /* código no válido */ }
}
const date = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

export const formatMoney = (n: number) => money.format(n);
export const formatDate = (iso: string) => date.format(new Date(`${iso}T00:00:00Z`));
