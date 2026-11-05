import { describe, expect, it } from 'vitest';
import { apiStatusOf } from './results';

describe('estados del proveedor', () => {
  it('90 minutos terminados, tiempo extra/penales, aplazados, cancelados y en juego', () => {
    expect(apiStatusOf('FT')).toBe('finished');
    expect(apiStatusOf('AET')).toBe('finished_extra');
    expect(apiStatusOf('PEN')).toBe('finished_extra');
    expect(['PST', 'SUSP', 'INT'].map(apiStatusOf)).toEqual(['postponed', 'postponed', 'postponed']);
    expect(['CANC', 'ABD', 'AWD', 'WO'].map(apiStatusOf)).toEqual(['cancelled', 'cancelled', 'cancelled', 'cancelled']);
    expect(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE'].map(apiStatusOf).every((s) => s === 'live')).toBe(true);
    expect(['NS', 'TBD'].map(apiStatusOf)).toEqual(['scheduled', 'scheduled']);
  });
});
