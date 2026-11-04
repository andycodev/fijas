import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'fijas-theme';

// El modo «sistema» sigue la preferencia del dispositivo; los otros dos la ignoran.
export const resolveTheme = (mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme =>
  mode === 'system' ? (systemPrefersDark ? 'dark' : 'light') : mode;

export const useThemeStore = defineStore('theme', () => {
  const stored = (() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
    } catch {
      return 'system'; // el almacenamiento puede estar bloqueado
    }
  })();

  const mode = ref<ThemeMode>(stored);
  const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const systemDark = ref(media?.matches ?? false);
  media?.addEventListener('change', (e) => { systemDark.value = e.matches; });

  const resolved = computed(() => resolveTheme(mode.value, systemDark.value));

  watch(
    [mode, resolved],
    () => {
      document.documentElement.setAttribute('data-theme', resolved.value);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved.value === 'dark' ? '#06131B' : '#F1F8FB');
      try { localStorage.setItem(STORAGE_KEY, mode.value); } catch { /* sin almacenamiento: no se recuerda */ }
    },
    { immediate: true },
  );

  return { mode, resolved, setMode: (m: ThemeMode) => { mode.value = m; } };
});
