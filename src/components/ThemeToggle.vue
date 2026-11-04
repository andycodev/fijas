<script setup lang="ts">
import { SunIcon, MoonIcon } from '@heroicons/vue/24/outline';
import { useThemeStore } from '../stores/theme';

const themeStore = useThemeStore();
</script>

<template>
  <button
    @click="themeStore.toggleTheme"
    class="btn btn-ghost btn-circle"
    aria-label="Toggle theme"
  >
    <SunIcon v-if="themeStore.theme === 'dark'" class="h-6 w-6" />
    <MoonIcon v-else class="h-6 w-6" />
  </button>
</template>
