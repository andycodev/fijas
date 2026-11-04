<script setup lang="ts">
defineProps<{ title: string; subtitle?: string; eyebrow?: string }>();
</script>

<template>
  <header class="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div class="min-w-0">
      <p v-if="eyebrow" class="eyebrow mb-1 text-brand">{{ eyebrow }}</p>
      <h1 class="text-2xl font-extrabold tracking-tight md:text-3xl">{{ title }}</h1>
      <!-- El subtítulo puede venir como texto o como contenido (para poder resaltar palabras de marca) -->
      <p v-if="subtitle || $slots.subtitle" class="mt-0.5 text-ink/60"><slot name="subtitle">{{ subtitle }}</slot></p>
    </div>
    <div v-if="$slots.actions" class="flex items-center gap-2"><slot name="actions" /></div>
  </header>
</template>
