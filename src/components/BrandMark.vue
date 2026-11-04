<script setup lang="ts">
import { useId } from 'vue';

defineProps<{ size?: number }>();
// Cada marca lleva su propio id de degradado: si dos copias comparten id y una está oculta (display:none), la otra pierde el relleno.
const gradId = `brand-grad-${useId()}`;
</script>

<template>
  <!-- Marca: un círculo central de cancha con una «fija» (punto de control) en el centro -->
  <svg :width="size ?? 28" :height="size ?? 28" viewBox="0 0 32 32" role="img" aria-label="Fijas" class="shrink-0">
    <defs>
      <linearGradient :id="gradId" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#00b4d8" />
        <stop offset="1" stop-color="#0077b6" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="9" :fill="`url(#${gradId})`" />
    <circle cx="16" cy="16" r="8" fill="none" stroke="#fff" stroke-opacity="0.85" stroke-width="1.8" />
    <line x1="16" y1="5" x2="16" y2="27" stroke="#fff" stroke-opacity="0.55" stroke-width="1.6" />
    <circle cx="16" cy="16" r="2.6" fill="#fff" />
  </svg>
</template>
