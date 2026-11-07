<script setup lang="ts">
import { watch } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
import {
  ArrowRightOnRectangleIcon,
  BeakerIcon,
  BoltIcon,
  ChartBarIcon,
  CalendarDaysIcon,
  Cog6ToothIcon,
} from '@heroicons/vue/24/outline';
import BrandMark from './BrandMark.vue';
import DensityToggle from './DensityToggle.vue';
import ThemeToggle from './ThemeToggle.vue';
import { useAutoResolve } from '../composables/useAutoResolve';
import { useProfile } from '../composables/useProfile';
import { setCurrency } from '../lib/format';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
useAutoResolve(); // revisa en segundo plano los resultados de las recomendaciones pendientes

// La moneda de los importes sale de tu perfil (por defecto, soles).
const profile = useProfile();
watch(() => profile.data.value?.currency, (c) => { if (c) setCurrency(c); }, { immediate: true });

// Secciones principales (también la barra inferior en el celular). La app es un laboratorio del modelo:
// analiza, registra recomendaciones y mide su rendimiento; no administra apuestas ni dinero.
const sections = [
  { name: 'picks', label: 'Picks', icon: BoltIcon },
  { name: 'matches', label: 'Partidos', icon: CalendarDaysIcon },
  { name: 'performance', label: 'Rendimiento', icon: ChartBarIcon },
  { name: 'model', label: 'Modelo', icon: BeakerIcon },
  { name: 'settings', label: 'Ajustes', icon: Cog6ToothIcon },
];
</script>

<template>
  <!-- Los márgenes seguros (notch en horizontal) se respetan en la raíz; arriba y abajo, en la barra superior e inferior -->
  <div class="flex h-full flex-col overflow-hidden pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:flex-row">
    <!-- Barra superior (celular) -->
    <header class="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-surface px-page-x pb-1.5 pt-[calc(env(safe-area-inset-top)+0.375rem)] md:hidden">
      <div class="flex items-center gap-2">
        <BrandMark :size="28" />
        <span class="text-lg font-extrabold tracking-tight">Fijas</span>
      </div>
      <div class="flex items-center gap-1.5">
        <DensityToggle compact />
        <ThemeToggle compact />
      </div>
    </header>

    <!-- Barra lateral: solo íconos en tablet (768–1023 px) y con etiquetas desde 1024 px -->
    <aside class="hidden w-16 shrink-0 flex-col border-r border-line bg-surface md:flex lg:w-56">
      <div class="pitch px-2 py-3 lg:px-4 lg:py-4">
        <div class="flex items-center justify-center gap-2.5 lg:justify-start">
          <BrandMark :size="34" />
          <div class="hidden lg:block">
            <p class="text-xl font-extrabold leading-none tracking-tight">Fijas</p>
            <p class="mt-1 text-cap text-ink/55">Laboratorio de goles y córners</p>
          </div>
        </div>
      </div>

      <nav class="flex flex-1 flex-col gap-1 px-2 pt-1 lg:px-3" aria-label="Secciones">
        <RouterLink
          v-for="s in sections"
          :key="s.name"
          :to="{ name: s.name }"
          :title="s.label"
          :aria-label="s.label"
          class="flex min-h-touch items-center justify-center gap-3 rounded-ctl border-l-[3px] border-transparent px-2 font-semibold text-ink/65 transition-colors hover:bg-sunken hover:text-ink lg:justify-start lg:px-3"
          active-class="!border-accent !bg-primary/10 !text-brand"
        >
          <component :is="s.icon" class="h-5 w-5 shrink-0" />
          <span class="hidden lg:inline">{{ s.label }}</span>
        </RouterLink>
      </nav>

      <div class="space-y-2 border-t border-line p-2 lg:p-3">
        <div class="hidden space-y-2 lg:block">
          <ThemeToggle block />
          <DensityToggle block />
          <p class="truncate px-1 text-xs text-ink/60" :title="auth.user?.email">{{ auth.user?.email }}</p>
        </div>
        <div class="flex flex-col items-center gap-2 lg:hidden">
          <ThemeToggle compact stack />
          <DensityToggle compact stack />
        </div>
        <button class="btn w-full" title="Cerrar sesión" aria-label="Cerrar sesión" @click="auth.signOut()">
          <ArrowRightOnRectangleIcon class="h-5 w-5" /><span class="hidden lg:inline">Cerrar sesión</span>
        </button>
      </div>
    </aside>

    <!-- Contenido -->
    <main class="relative min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto w-full max-w-page px-page-x py-page-y">
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
        class="relative flex min-h-[var(--nav-h)] flex-col items-center justify-center gap-0.5 text-cap font-semibold text-ink/55"
        active-class="!text-brand"
      >
        <component :is="s.icon" class="h-6 w-6" />
        {{ s.label }}
      </RouterLink>
    </nav>
  </div>
</template>
