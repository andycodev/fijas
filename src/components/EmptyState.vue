<script setup lang="ts">
defineProps<{ message: string }>();
</script>

<template>
  <div class="card flex min-h-40 items-center justify-center p-6 text-center text-ink/60">
    {{ message }}
  </div>
</template>
