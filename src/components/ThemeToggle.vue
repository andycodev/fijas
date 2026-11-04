<script setup lang="ts">
import { ComputerDesktopIcon, MoonIcon, SunIcon } from '@heroicons/vue/24/outline';
import { useThemeStore, type ThemeMode } from '../stores/theme';

// compact: solo íconos (barra superior del celular); si no, íconos con texto.
defineProps<{ compact?: boolean; block?: boolean }>();

const theme = useThemeStore();
const options: { mode: ThemeMode; label: string; icon: typeof SunIcon }[] = [
  { mode: 'system', label: 'Sistema', icon: ComputerDesktopIcon },
  { mode: 'light', label: 'Claro', icon: SunIcon },
  { mode: 'dark', label: 'Oscuro', icon: MoonIcon },
];
</script>

<template>
  <div class="rounded-lg border border-line bg-sunken p-0.5" :class="block ? 'grid w-full grid-cols-3' : 'inline-flex'" role="radiogroup" aria-label="Tema de la aplicación">
    <button
      v-for="o in options"
      :key="o.mode"
      type="button"
      role="radio"
      :aria-checked="theme.mode === o.mode"
      :aria-label="o.label"
      :title="o.label"
      class="inline-flex min-h-touch items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition-colors"
      :class="[block ? 'px-1' : 'min-w-touch px-2.5', theme.mode === o.mode ? 'bg-surface text-brand shadow-sm' : 'text-ink/60 hover:text-ink']"
      @click="theme.setMode(o.mode)"
    >
      <component :is="o.icon" class="h-4 w-4" aria-hidden="true" />
      <span v-if="!compact">{{ o.label }}</span>
    </button>
  </div>
</template>
