<script setup lang="ts">
import { RouterLink } from 'vue-router';
import ModelPerformance from '../components/ModelPerformance.vue';
import PageHeader from '../components/PageHeader.vue';
</script>

<template>
  <PageHeader title="Rendimiento" eyebrow="Medición del modelo">
    <template #subtitle>
      ¿Acierta el modelo más de lo que corresponde por azar? Cada recomendación de Analizar se guarda y se evalúa sola.
      Cómo funciona el modelo está en <RouterLink :to="{ name: 'model' }" class="font-semibold text-brand underline">Modelo</RouterLink>.
    </template>
  </PageHeader>
  <ModelPerformance />
</template>
