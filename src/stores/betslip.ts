import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import type { Selection } from '../lib/opportunities';
import type { Market } from '../types/db';

// Una selección dentro del boleto en construcción.
export interface SlipItem {
  key: string;
  matchId: number;
  pickId: number | null;
  market: Market;
  line: number;
  side: 'over' | 'under';
  odds: number;
  modelProbability: number | null;
  home: string;
  away: string;
  league: string;
  kickoff: string;
  oddsOrigin: 'auto' | 'manual' | null;
}

export const slipKey = (matchId: number, market: string, line: number, side: string) => `${matchId}|${market}|${line}|${side}`;

export function slipItemFromSelection(s: Selection): SlipItem {
  return {
    key: slipKey(s.matchId, s.market, s.line, s.side),
    matchId: s.matchId,
    pickId: s.pickId,
    market: s.market,
    line: s.line,
    side: s.side,
    odds: s.betano!.odds,
    modelProbability: s.probability,
    home: s.match.home?.name ?? '?',
    away: s.match.away?.name ?? '?',
    league: s.match.league?.name ?? '',
    kickoff: s.match.kickoff_at,
    oddsOrigin: s.betano!.origin,
  };
}

const STORAGE_KEY = 'fijas-betslip';

function load(): SlipItem[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SlipItem[]) : [];
  } catch {
    return [];
  }
}

export const useBetSlipStore = defineStore('betslip', () => {
  const items = ref<SlipItem[]>(load());
  const open = ref(false);

  watch(items, (v) => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch { /* sin almacenamiento: no se recuerda */ }
  }, { deep: true });

  const count = computed(() => items.value.length);
  const has = (key: string) => items.value.some((i) => i.key === key);
  const add = (item: SlipItem) => { if (!has(item.key)) items.value.push(item); };
  const remove = (key: string) => { items.value = items.value.filter((i) => i.key !== key); };
  const toggle = (item: SlipItem) => (has(item.key) ? remove(item.key) : add(item));
  const clear = () => { items.value = []; };
  const setOdds = (key: string, odds: number) => { const i = items.value.find((x) => x.key === key); if (i) i.odds = odds; };

  return { items, open, count, has, add, remove, toggle, clear, setOdds };
});
