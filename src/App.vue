<script setup lang="ts">
import { onMounted } from 'vue';
import { useThemeStore } from './stores/theme';
import ThemeToggle from './components/ThemeToggle.vue';
import { RouterView } from 'vue-router';

const themeStore = useThemeStore();

onMounted(() => {
  themeStore.loadTheme();
});
</script>

<template>
  <div class="navbar bg-base-100 shadow-sm">
    <div class="flex-1">
      <a class="btn btn-ghost text-xl">Fijas</a>
    </div>
    <div class="flex-none">
      <ThemeToggle />
    </div>
  </div>
  <RouterView />
</template>
