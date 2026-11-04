import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores/auth';
import type { League, Profile } from '../types/db';

export function useProfile() {
  const auth = useAuthStore();
  return useQuery({
    queryKey: ['profile', () => auth.user?.id],
    enabled: () => !!auth.user,
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase.from('profiles').select('*').single();
      if (error) throw error;
      return data as Profile;
    },
  });
}

export function useLeagues() {
  return useQuery({
    queryKey: ['leagues'],
    staleTime: Infinity,
    queryFn: async (): Promise<League[]> => {
      const { data, error } = await supabase.from('leagues').select('id, name, country, active').order('name');
      if (error) throw error;
      return data as League[];
    },
  });
}

export function useUpdateProfile() {
  const auth = useAuthStore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (changes: Partial<Omit<Profile, 'user_id'>>) => {
      const { error } = await supabase.from('profiles').update(changes).eq('user_id', auth.user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  });
}
