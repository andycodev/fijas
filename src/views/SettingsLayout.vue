<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';

const tabs = [
  { name: 'settings', label: 'Criterios del modelo' },
  { name: 'settings-leagues', label: 'Ligas' },
  { name: 'settings-api', label: 'Consumo de API' },
];
</script>

<template>
  <PageHeader title="Ajustes" subtitle="Tu perfil, tus ligas y el consumo de la API" />

  <nav class="sticky-bar mb-stack grid grid-cols-3 gap-stack-sm" aria-label="Secciones de ajustes">
    <RouterLink
      v-for="t in tabs"
      :key="t.name"
      :to="{ name: t.name }"
      class="btn !px-2 text-center text-xs"
      exact-active-class="!border-primary !text-brand"
    >
      {{ t.label }}
    </RouterLink>
  </nav>

  <RouterView />
</template>
