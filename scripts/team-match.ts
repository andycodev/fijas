// Unión de nombres de equipo entre Football-Data y API-Football.
// Solo servidor/scripts.

const STOP = new Set(['fc', 'cf', 'ac', 'as', 'sc', 'ss', 'afc', 'ssc', 'us', 'fk', 'sv', 'vfl', 'vfb', 'tsg', 'fsv', 'rb', 'club', 'de', 'calcio', 'balompie', '1', '04', '05', '96', '1846', '1899', '1900', '1909']);

export function normalize(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t))
    .join(' ');
}

// Diferencias conocidas entre cómo Football-Data y API-Football escriben el mismo club.
// Clave y valor ya normalizados con normalize(). Se amplía a mano cuando el script reporta un caso sin unir.
export const ALIASES: Record<string, string> = {
  'manchester united': 'man united',
  'manchester city': 'man city',
  'nottingham forest': 'nott m forest',
  'wolverhampton wanderers': 'wolves',
  'tottenham': 'tottenham',
  'newcastle': 'newcastle',
  'atletico madrid': 'ath madrid',
  'athletic': 'ath bilbao',
  'athletic club': 'ath bilbao',
  'bayern munchen': 'bayern munich',
  'real betis': 'betis',
  'real sociedad': 'sociedad',
  'rayo vallecano': 'vallecano',
  'celta vigo': 'celta',
  'espanyol': 'espanol',
  'inter': 'inter',
  'ac milan': 'milan',
  'bayern munich': 'bayern munich',
  'borussia dortmund': 'dortmund',
  'borussia monchengladbach': 'm gladbach',
  'bayer leverkusen': 'leverkusen',
  'eintracht frankfurt': 'ein frankfurt',
  'hoffenheim': 'hoffenheim',
  'fsv mainz 05': 'mainz',
  'mainz 05': 'mainz',
  'werder bremen': 'werder bremen',
  'union berlin': 'union berlin',
  'st pauli': 'st pauli',
  'fc koln': 'fc koln',
  'koln': 'fc koln',
  'heidenheim': 'heidenheim',
  'sc freiburg': 'freiburg',
  'freiburg': 'freiburg',
  'vfl wolfsburg': 'wolfsburg',
  'augsburg': 'augsburg',
};

export interface DbTeam {
  id: number;
  name: string;
  football_data_name: string | null;
  aliases: string[];
  api_football_id: number | null;
}

// Devuelve el equipo de la base que corresponde a un nombre de API-Football, o null si no hay unión clara.
export function matchTeam(apiName: string, candidates: DbTeam[], opts: { exactOnly?: boolean } = {}): DbTeam | null {
  const target = normalize(apiName);
  const aliasTarget = ALIASES[target] ?? target;
  const keys = (t: DbTeam) => [t.name, t.football_data_name ?? '', ...t.aliases].map(normalize).filter(Boolean);

  // 1) igualdad exacta (con o sin alias conocido)
  const exact = candidates.filter((t) => keys(t).some((k) => k === target || k === aliasTarget));
  if (exact.length === 1) return exact[0]!;
  if (opts.exactOnly) return null;

  // 2) uno contiene al otro, solo si es único (evita unir "Man City" con "Man United")
  const loose = candidates.filter((t) =>
    keys(t).some((k) => k.length >= 4 && (target.includes(k) || k.includes(target) || aliasTarget.includes(k) || k.includes(aliasTarget))),
  );
  return loose.length === 1 ? loose[0]! : null;
}
