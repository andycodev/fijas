<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
import {
  BanknotesIcon,
  BoltIcon,
  Cog6ToothIcon,
  TicketIcon,
} from '@heroicons/vue/24/outline';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();

const sections = [
  { name: 'picks', label: 'Picks', icon: BoltIcon },
  { name: 'bets', label: 'Apuestas', icon: TicketIcon },
  { name: 'cash', label: 'Caja', icon: BanknotesIcon },
  { name: 'settings', label: 'Ajustes', icon: Cog6ToothIcon },
];
</script>

<template>
  <div class="flex h-full flex-col md:flex-row">
    <!-- Barra lateral (escritorio) -->
    <aside class="hidden w-56 shrink-0 flex-col border-r border-line bg-white md:flex">
      <div class="px-5 py-4 text-lg font-extrabold tracking-tight">Fijas</div>
      <nav class="flex flex-1 flex-col gap-1 px-3" aria-label="Secciones">
        <RouterLink
          v-for="s in sections"
          :key="s.name"
          :to="{ name: s.name }"
          class="flex min-h-touch items-center gap-3 rounded-md px-3 font-semibold text-ink/70 hover:bg-canvas"
          active-class="!bg-value/10 !text-value"
        >
          <component :is="s.icon" class="h-5 w-5" />
          {{ s.label }}
        </RouterLink>
      </nav>
      <div class="border-t border-line p-3">
        <p class="truncate px-1 pb-2 text-xs text-ink/60">{{ auth.user?.email }}</p>
        <button class="btn w-full" @click="auth.signOut()">Cerrar sesión</button>
      </div>
    </aside>

    <!-- Contenido -->
    <main class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto w-full max-w-3xl px-4 py-4 md:px-6 md:py-6">
        <RouterView />
      </div>
    </main>

    <!-- Navegación inferior (celular) -->
    <nav
      class="grid shrink-0 grid-cols-4 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Secciones"
    >
      <RouterLink
        v-for="s in sections"
        :key="s.name"
        :to="{ name: s.name }"
        class="flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-ink/60"
        active-class="!text-value"
      >
        <component :is="s.icon" class="h-6 w-6" />
        {{ s.label }}
      </RouterLink>
    </nav>
  </div>
</template>
