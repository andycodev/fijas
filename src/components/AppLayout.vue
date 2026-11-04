<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
import {
  ArrowRightOnRectangleIcon,
  BanknotesIcon,
  BeakerIcon,
  BoltIcon,
  CalendarDaysIcon,
  Cog6ToothIcon,
  TicketIcon,
} from '@heroicons/vue/24/outline';
import BrandMark from './BrandMark.vue';
import ThemeToggle from './ThemeToggle.vue';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();

// Cinco secciones principales (barra inferior en el celular). «Modelo» es de consulta y vive en la barra lateral y en Picks.
const sections = [
  { name: 'picks', label: 'Picks', icon: BoltIcon },
  { name: 'matches', label: 'Partidos', icon: CalendarDaysIcon },
  { name: 'bets', label: 'Apuestas', icon: TicketIcon },
  { name: 'cash', label: 'Caja', icon: BanknotesIcon },
  { name: 'settings', label: 'Ajustes', icon: Cog6ToothIcon },
];
</script>

<template>
  <div class="flex h-full flex-col md:flex-row">
    <!-- Barra superior (celular) -->
    <header class="flex shrink-0 items-center justify-between border-b border-line bg-surface px-4 py-2 md:hidden">
      <div class="flex items-center gap-2">
        <BrandMark :size="28" />
        <span class="text-lg font-extrabold tracking-tight">Fijas</span>
      </div>
      <ThemeToggle compact />
    </header>

    <!-- Barra lateral (escritorio) -->
    <aside class="hidden w-64 shrink-0 flex-col border-r border-line bg-surface md:flex">
      <div class="pitch px-5 py-5">
        <div class="flex items-center gap-2.5">
          <BrandMark :size="34" />
          <div>
            <p class="text-xl font-extrabold leading-none tracking-tight">Fijas</p>
            <p class="mt-1 text-[11px] text-ink/55">Goles y córners, con números</p>
          </div>
        </div>
      </div>

      <nav class="flex flex-1 flex-col gap-1 px-3 pt-2" aria-label="Secciones">
        <RouterLink
          v-for="s in sections"
          :key="s.name"
          :to="{ name: s.name }"
          class="flex min-h-touch items-center gap-3 rounded-lg border-l-[3px] border-transparent px-3 font-semibold text-ink/65 transition-colors hover:bg-sunken hover:text-ink"
          active-class="!border-accent !bg-primary/10 !text-brand"
        >
          <component :is="s.icon" class="h-5 w-5" />
          {{ s.label }}
        </RouterLink>

        <p class="eyebrow mt-4 px-3">Referencia</p>
        <RouterLink
          :to="{ name: 'model' }"
          class="flex min-h-touch items-center gap-3 rounded-lg border-l-[3px] border-transparent px-3 font-semibold text-ink/65 transition-colors hover:bg-sunken hover:text-ink"
          active-class="!border-accent !bg-primary/10 !text-brand"
        >
          <BeakerIcon class="h-5 w-5" />
          Modelo
        </RouterLink>
      </nav>

      <div class="space-y-3 border-t border-line p-3">
        <ThemeToggle block />
        <p class="truncate px-1 text-xs text-ink/60">{{ auth.user?.email }}</p>
        <button class="btn w-full" @click="auth.signOut()"><ArrowRightOnRectangleIcon class="h-5 w-5" />Cerrar sesión</button>
      </div>
    </aside>

    <!-- Contenido -->
    <main class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto w-full max-w-6xl px-4 py-5 md:px-8 md:py-8">
        <RouterView />
      </div>
    </main>

    <!-- Navegación inferior (celular) -->
    <nav
      class="grid shrink-0 grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Secciones"
    >
      <RouterLink
        v-for="s in sections"
        :key="s.name"
        :to="{ name: s.name }"
        class="relative flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-ink/55"
        active-class="!text-brand"
      >
        <component :is="s.icon" class="h-6 w-6" />
        {{ s.label }}
      </RouterLink>
    </nav>
  </div>
</template>
