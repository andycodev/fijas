<script setup lang="ts">
import { computed } from 'vue';
import Betano from './Betano.vue';
import { evIfModelOff } from '../lib/stake';

const props = defineProps<{
  ev: number; // valor esperado (0.2 = +20 %)
  probability: number;
  odds: number;
  origin: 'auto' | 'manual'; // manual = cuota escrita por el usuario (confirmada)
  capturedAt: string;
}>();

const pct = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n * 100).toFixed(1)}%`;
const robust = computed(() => evIfModelOff(props.probability, props.odds, 0.05));
const time = computed(() =>
  props.capturedAt
    ? new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(props.capturedAt))
    : '',
);
</script>

<template>
  <aside class="space-y-2 rounded-md border border-marginal bg-marginal/10 p-3 text-xs" role="note">
    <p class="font-bold text-marginal">Valor inusualmente alto ({{ pct(ev) }}): verifica la cuota antes de apostar</p>
    <p>
      Las casas de apuestas casi nunca pagan tanto por encima de la cuota justa. Cuando el valor sale tan alto, lo más probable es
      que haya una explicación menos feliz:
    </p>
    <ul class="list-disc space-y-1 pl-4">
      <li v-if="origin === 'auto'">
        <strong>La cuota está desfasada o es de otra versión de <Betano />.</strong> Viene de un proveedor (actualizada {{ time }}) y no
        está verificada: tu <Betano /> puede estar pagando menos.
      </li>
      <li v-else>
        <strong>Revisa que la cuota que escribiste sea de esta misma línea.</strong> Ya la confirmaste, pero una línea distinta
        (por ejemplo 2.5 en vez de 3.5) cambia todo.
      </li>
      <li>
        <strong>El modelo puede ignorar algo que el mercado sí sabe:</strong> bajas, rotaciones, un partido sin importancia o
        cambios de última hora. El modelo no conoce las lesiones.
      </li>
      <li><strong>El mercado puede ser otro:</strong> comprueba que sea «partido completo» y no un mercado parecido.</li>
    </ul>
    <p>
      <strong>Qué hacer:</strong> abre este partido en tu <Betano />, comprueba la línea y la cuota exacta, y escríbela en «Tu
      cuota». Así queda confirmada y el valor se recalcula con el dato real.
    </p>
    <p class="text-ink/70">
      <strong>Prueba de fragilidad:</strong> si el modelo se equivocara en solo 5 puntos de probabilidad, este valor bajaría a
      <strong :class="robust >= 0 ? 'text-value' : 'text-novalue'">{{ pct(robust) }}</strong>.
    </p>
  </aside>
</template>
