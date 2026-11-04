import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null);
  const ready = ref(false);
  let initPromise: Promise<void> | null = null;

  const user = computed(() => session.value?.user ?? null);

  // Carga la sesión guardada una sola vez y se suscribe a los cambios.
  function init(): Promise<void> {
    initPromise ??= (async () => {
      const { data } = await supabase.auth.getSession();
      session.value = data.session;
      supabase.auth.onAuthStateChange((_event, next) => {
        session.value = next;
      });
      ready.value = true;
    })();
    return initPromise;
  }

  async function signIn(email: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) return null;
    return error.message === 'Invalid login credentials'
      ? 'Correo o contraseña incorrectos.'
      : 'No se pudo iniciar sesión. Inténtalo de nuevo.';
  }

  async function signOut(): Promise<void> {
    await supabase.auth.signOut();
  }

  return { session, user, ready, init, signIn, signOut };
});
