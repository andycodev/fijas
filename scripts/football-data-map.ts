// Ligas de la API (API-Football) que tienen histórico gratuito en Football-Data.co.uk, con el código de su CSV.
// Si una liga no está aquí se puede analizar (partidos y cuotas) pero no habrá historial para calcular picks:
// la app lo indica. Los ids se comprueban contra el catálogo de la API al agregar la liga.
export const FOOTBALL_DATA_CODES: Record<number, { code: string; expectedName: RegExp }> = {
  39: { code: 'E0', expectedName: /premier league/i },
  40: { code: 'E1', expectedName: /championship/i },
  41: { code: 'E2', expectedName: /league one/i },
  42: { code: 'E3', expectedName: /league two/i },
  140: { code: 'SP1', expectedName: /la liga/i },
  141: { code: 'SP2', expectedName: /segunda/i },
  135: { code: 'I1', expectedName: /serie a/i },
  136: { code: 'I2', expectedName: /serie b/i },
  78: { code: 'D1', expectedName: /bundesliga/i },
  79: { code: 'D2', expectedName: /2\. bundesliga|bundesliga 2/i },
  61: { code: 'F1', expectedName: /ligue 1/i },
  62: { code: 'F2', expectedName: /ligue 2/i },
  88: { code: 'N1', expectedName: /eredivisie/i },
  94: { code: 'P1', expectedName: /primeira liga/i },
  144: { code: 'B1', expectedName: /pro league|jupiler/i },
  203: { code: 'T1', expectedName: /s[uü]per lig/i },
  197: { code: 'G1', expectedName: /super league/i },
  179: { code: 'SC0', expectedName: /premiership/i },
};
