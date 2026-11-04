<script setup lang="ts">
import { CheckCircleIcon } from '@heroicons/vue/24/outline';
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-base-200">
    <div class="card w-96 bg-base-100 shadow-xl">
      <div class="card-body items-center text-center">
        <CheckCircleIcon class="h-16 w-16 text-success mb-4" />
        <h2 class="card-title">Fijas</h2>
        <p class="text-base-content/70">Proyecto base con Vue 3 y Supabase</p>
        <div class="divider"></div>
        <div class="text-left text-sm">
          <ul class="space-y-2">
            <li class="flex items-center gap-2">
              <span class="badge badge-success badge-sm">✓</span>
              Vue 3 + TypeScript
            </li>
            <li class="flex items-center gap-2">
              <span class="badge badge-success badge-sm">✓</span>
              Tailwind CSS + DaisyUI
            </li>
            <li class="flex items-center gap-2">
              <span class="badge badge-success badge-sm">✓</span>
              Vue Router + Pinia
            </li>
            <li class="flex items-center gap-2">
              <span class="badge badge-success badge-sm">✓</span>
              Supabase integrado
            </li>
            <li class="flex items-center gap-2">
              <span class="badge badge-success badge-sm">✓</span>
              Tema claro/oscuro
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
