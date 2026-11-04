<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { TrashIcon } from '@heroicons/vue/24/outline';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import { useCash } from '../composables/useCash';
import { formatDate, formatMoney } from '../lib/format';

const cash = useCash();

const today = () => new Date().toISOString().slice(0, 10);
const form = reactive({ type: 'deposit' as 'deposit' | 'withdrawal', amount: null as number | null, occurred_on: today(), note: '' });
const betanoBalance = ref<number | null>(null);

const lastReconciliation = computed(() => cash.reconciliations.data.value?.[0] ?? null);

async function submitMovement() {
  if (!form.amount) return;
  await cash.addMovement.mutateAsync({ type: form.type, amount: form.amount, occurred_on: form.occurred_on, note: form.note.trim() });
  form.amount = null;
  form.note = '';
}

async function submitReconciliation() {
  if (betanoBalance.value === null) return;
  await cash.addReconciliation.mutateAsync(betanoBalance.value);
  betanoBalance.value = null;
}

function diffClass(diff: number) {
  return Math.abs(diff) < 0.01 ? 'text-value' : 'text-novalue';
}
</script>

<template>
  <PageHeader title="Caja" subtitle="Saldo, depósitos y retiros" />

  <section class="card mb-4 p-4">
    <p class="text-xs font-semibold text-ink/60">Saldo calculado</p>
    <p class="text-3xl font-extrabold tracking-tight">
      {{ cash.balance.value === null ? '—' : formatMoney(cash.balance.value) }}
    </p>
    <p class="text-xs text-ink/60">
      Bankroll inicial + depósitos − retiros + resultado de apuestas cerradas − apuestas abiertas.
    </p>
  </section>

  <form class="card mb-4 space-y-3 p-4" @submit.prevent="submitMovement">
    <h2 class="font-bold">Nuevo movimiento</h2>

    <div class="grid grid-cols-2 gap-2">
      <label class="btn cursor-pointer has-[:checked]:border-value has-[:checked]:text-value">
        <input v-model="form.type" type="radio" value="deposit" class="sr-only" />
        Depósito
      </label>
      <label class="btn cursor-pointer has-[:checked]:border-novalue has-[:checked]:text-novalue">
        <input v-model="form.type" type="radio" value="withdrawal" class="sr-only" />
        Retiro
      </label>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <label class="block space-y-1">
        <span class="text-xs font-semibold">Monto</span>
        <input v-model.number="form.amount" type="number" min="0.01" step="0.01" required class="field" />
      </label>
      <label class="block space-y-1">
        <span class="text-xs font-semibold">Fecha</span>
        <input v-model="form.occurred_on" type="date" required class="field" />
      </label>
    </div>

    <label class="block space-y-1">
      <span class="text-xs font-semibold">Nota (opcional)</span>
      <input v-model="form.note" type="text" maxlength="120" class="field" />
    </label>

    <p v-if="cash.addMovement.isError.value" role="alert" class="text-xs font-semibold text-novalue">
      No se pudo guardar el movimiento.
    </p>
    <button type="submit" class="btn btn-primary w-full" :disabled="cash.addMovement.isPending.value">
      Guardar movimiento
    </button>
  </form>

  <form class="card mb-4 space-y-3 p-4" @submit.prevent="submitReconciliation">
    <h2 class="font-bold">Conciliación con Betano</h2>
    <div class="flex gap-2">
      <label class="block flex-1 space-y-1">
        <span class="text-xs font-semibold">Saldo que muestra Betano</span>
        <input v-model.number="betanoBalance" type="number" step="0.01" required class="field" />
      </label>
      <button
        type="submit"
        class="btn self-end"
        :disabled="cash.balance.value === null || cash.addReconciliation.isPending.value"
      >
        Conciliar
      </button>
    </div>
    <p v-if="lastReconciliation" class="text-xs">
      Última ({{ formatDate(lastReconciliation.checked_on) }}): diferencia
      <strong :class="diffClass(lastReconciliation.difference)">
        {{ formatMoney(lastReconciliation.difference) }}
      </strong>
      (Betano {{ formatMoney(lastReconciliation.betano_balance) }} vs calculado
      {{ formatMoney(lastReconciliation.calculated_balance) }})
    </p>
  </form>

  <h2 class="mb-2 font-bold">Movimientos</h2>
  <EmptyState v-if="!cash.movements.data.value?.length" message="Aún no hay movimientos." />
  <ul v-else class="card divide-y divide-line">
    <li v-for="m in cash.movements.data.value" :key="m.id" class="flex items-center gap-3 px-4 py-2">
      <div class="min-w-0 flex-1">
        <p class="font-semibold">{{ m.type === 'deposit' ? 'Depósito' : 'Retiro' }}</p>
        <p class="truncate text-xs text-ink/60">{{ formatDate(m.occurred_on) }}<span v-if="m.note"> · {{ m.note }}</span></p>
      </div>
      <span class="font-bold" :class="m.type === 'deposit' ? 'text-value' : 'text-novalue'">
        {{ m.type === 'deposit' ? '+' : '−' }}{{ formatMoney(m.amount) }}
      </span>
      <button
        class="btn !border-transparent !px-2"
        aria-label="Eliminar movimiento"
        :disabled="cash.removeMovement.isPending.value"
        @click="cash.removeMovement.mutate(m.id)"
      >
        <TrashIcon class="h-5 w-5" />
      </button>
    </li>
  </ul>
</template>
