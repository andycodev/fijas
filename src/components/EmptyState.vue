<script setup lang="ts">
defineProps<{ message: string }>();
</script>

<template>
  <div class="card pitch flex min-h-40 flex-col items-center justify-center gap-2 p-6 text-center text-ink/65">
    <slot name="icon" />
    <p class="max-w-md">{{ message }}</p>
    <slot />
  </div>
</template>
