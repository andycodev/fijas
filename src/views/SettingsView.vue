<script setup lang="ts">
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
</script>

<template>
  <PageHeader title="Ajustes" subtitle="Tu perfil y preferencias" />
  <EmptyState message="Aún no hay ajustes." />
  <div class="card mt-4 flex items-center justify-between gap-3 p-4 md:hidden">
    <span class="truncate text-xs text-ink/60">{{ auth.user?.email }}</span>
    <button class="btn" @click="auth.signOut()">Cerrar sesión</button>
  </div>
</template>
