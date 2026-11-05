<script setup lang="ts">
// Indicador de espera con tema de fútbol: un balón que rebota junto a una bandera de córner.
// size «sm» va en línea con su texto; «md» es el grande, para esperas largas; «full» ocupa toda la pantalla.
withDefaults(defineProps<{ label?: string; hint?: string; size?: 'sm' | 'md'; full?: boolean }>(), { label: 'Cargando…', size: 'md' });
</script>

<template>
  <div
    class="flex items-center justify-center gap-3 text-center"
    :class="[full ? 'min-h-full flex-1 py-16' : '', size === 'md' ? 'flex-col' : 'flex-row text-left']"
    role="status"
    aria-live="polite"
  >
    <svg :class="size === 'md' ? 'w-40' : 'w-16 shrink-0'" viewBox="0 0 120 84" aria-hidden="true">
      <!-- Césped -->
      <line x1="6" x2="114" y1="72" y2="72" stroke="rgb(var(--c-accent))" stroke-width="3" stroke-linecap="round" />
      <!-- Bandera de córner -->
      <g class="fl-flag">
        <line x1="104" x2="104" y1="72" y2="40" stroke="rgb(var(--c-ink))" stroke-width="2" stroke-linecap="round" />
        <path d="M104 40 L116 45 L104 50 Z" fill="rgb(var(--c-accent))" />
      </g>
      <!-- Sombra -->
      <ellipse class="fl-shadow" cx="52" cy="72" rx="13" ry="2.5" fill="rgb(var(--c-ink))" opacity="0.18" />
      <!-- Balón -->
      <g class="fl-bounce">
        <g class="fl-spin">
          <circle cx="52" cy="46" r="15" fill="rgb(var(--c-surface))" stroke="rgb(var(--c-ink))" stroke-width="2" />
          <path d="M52 39.5 L58.2 44 L55.8 51.3 L48.2 51.3 L45.8 44 Z" fill="rgb(var(--c-ink))" />
          <path d="M52 39.5 V33 M58.2 44 L64 41.5 M55.8 51.3 L60 57 M48.2 51.3 L44 57 M45.8 44 L40 41.5" stroke="rgb(var(--c-ink))" stroke-width="1.6" stroke-linecap="round" fill="none" />
        </g>
      </g>
    </svg>
    <div class="min-w-0">
      <p class="font-bold" :class="size === 'md' ? 'text-base' : 'text-sm'">{{ label }}</p>
      <p v-if="hint" class="mt-0.5 max-w-sm text-xs text-ink/65">{{ hint }}</p>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.fl-bounce { animation: fl-bounce 0.9s cubic-bezier(0.3, 0, 0.7, 1) infinite; transform-box: fill-box; transform-origin: center bottom; }
.fl-spin { animation: fl-spin 1.8s linear infinite; transform-box: fill-box; transform-origin: center; }
.fl-shadow { animation: fl-shadow 0.9s cubic-bezier(0.3, 0, 0.7, 1) infinite; transform-box: fill-box; transform-origin: center; }
.fl-flag { animation: fl-wave 1.6s ease-in-out infinite; transform-box: fill-box; transform-origin: left bottom; }

@keyframes fl-bounce { 0%, 100% { transform: translateY(0) scale(1.08, 0.92); } 50% { transform: translateY(-26px) scale(1, 1); } }
@keyframes fl-shadow { 0%, 100% { transform: scale(1); opacity: 0.2; } 50% { transform: scale(0.6); opacity: 0.08; } }
@keyframes fl-spin { to { transform: rotate(360deg); } }
@keyframes fl-wave { 0%, 100% { transform: rotate(-2deg); } 50% { transform: rotate(2deg); } }

/* Quien tiene desactivadas las animaciones ve el balón quieto. */
@media (prefers-reduced-motion: reduce) {
  .fl-bounce, .fl-spin, .fl-shadow, .fl-flag { animation: none; }
}
</style>
