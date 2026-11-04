import { ref, watch } from 'vue';
import { useProfile, useUpdateProfile } from './useProfile';
import { DEFAULT_MIN_PROBABILITY } from '../lib/probability';

// Probabilidad mínima para recomendar: se guarda en el perfil y la comparten Picks y Partidos.
export function useMinProbability() {
  const profile = useProfile();
  const update = useUpdateProfile();
  const minProbability = ref(DEFAULT_MIN_PROBABILITY);

  watch(
    () => profile.data.value?.min_probability,
    (v) => { if (v !== undefined && v !== null) minProbability.value = Number(v); },
    { immediate: true },
  );

  function setMinProbability(v: number) {
    minProbability.value = v;
    update.mutate({ min_probability: v });
  }
  return { minProbability, setMinProbability };
}
