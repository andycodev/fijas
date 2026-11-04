<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>();
</script>

<template>
  <header class="mb-4">
    <h1 class="text-xl font-extrabold tracking-tight">{{ title }}</h1>
    <p v-if="subtitle" class="text-ink/60">{{ subtitle }}</p>
  </header>
</template>
