<script setup lang="ts">
import { ref } from 'vue';
import { RouterView, useRouter } from 'vue-router';
import FootballLoader from './components/FootballLoader.vue';

// Mientras se comprueba la sesión y se resuelve la primera ruta, se muestra el balón en lugar de una pantalla en blanco.
const ready = ref(false);
useRouter().isReady().finally(() => { ready.value = true; });
</script>

<template>
  <div v-if="!ready" class="flex min-h-screen items-center justify-center bg-canvas text-ink">
    <FootballLoader label="Cargando Fijas…" />
  </div>
  <RouterView v-else />
</template>
