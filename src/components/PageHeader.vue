<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>();
</script>

<template>
  <header class="mb-4">
    <h1 class="text-xl font-extrabold tracking-tight">{{ title }}</h1>
    <!-- El subtítulo puede venir como texto o como contenido (para poder resaltar palabras de marca) -->
    <p v-if="subtitle || $slots.subtitle" class="text-ink/60"><slot name="subtitle">{{ subtitle }}</slot></p>
  </header>
</template>
