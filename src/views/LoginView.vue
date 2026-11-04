<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const email = ref('');
const password = ref('');
const error = ref<string | null>(null);
const loading = ref(false);

async function submit() {
  error.value = null;
  loading.value = true;
  const message = await auth.signIn(email.value.trim(), password.value);
  loading.value = false;
  if (message) {
    error.value = message;
    return;
  }
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '';
  await router.replace(redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/');
}
</script>

<template>
  <div class="flex min-h-full items-center justify-center px-4">
    <form class="card w-full max-w-sm space-y-4 p-6" @submit.prevent="submit">
      <div>
        <h1 class="text-2xl font-extrabold tracking-tight">Fijas</h1>
        <p class="text-ink/60">Inicia sesión para continuar</p>
      </div>

      <label class="block space-y-1">
        <span class="text-xs font-semibold">Correo</span>
        <input v-model="email" type="email" autocomplete="email" required class="field" />
      </label>

      <label class="block space-y-1">
        <span class="text-xs font-semibold">Contraseña</span>
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
          class="field"
        />
      </label>

      <p v-if="error" role="alert" class="text-xs font-semibold text-novalue">{{ error }}</p>

      <button type="submit" class="btn btn-primary w-full" :disabled="loading">
        {{ loading ? 'Entrando…' : 'Entrar' }}
      </button>
    </form>
  </div>
</template>
