<script setup lang="ts">
// Cabecera compacta: título y subtítulo en una sola franja; sin etiqueta superior para no gastar una línea.
defineProps<{ title: string; subtitle?: string; eyebrow?: string }>();
</script>

<template>
  <header class="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
    <div class="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <h1 class="text-xl font-extrabold tracking-tight md:text-2xl">{{ title }}</h1>
      <!-- El subtítulo puede venir como texto o como contenido (para poder resaltar palabras de marca) -->
      <p v-if="subtitle || $slots.subtitle" class="min-w-0 text-xs text-ink/60 md:text-sm"><slot name="subtitle">{{ subtitle }}</slot></p>
    </div>
    <div v-if="$slots.actions" class="flex items-center gap-2"><slot name="actions" /></div>
  </header>
</template>
