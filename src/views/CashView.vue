<script setup lang="ts">
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
</script>

<template>
  <PageHeader title="Caja" subtitle="Saldo, depósitos y retiros" />
  <EmptyState message="Aún no hay movimientos." />
</template>
