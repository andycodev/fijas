import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { guestOnly: true },
  },
  {
    path: '/',
    component: () => import('../components/AppLayout.vue'),
    meta: { requiresAuth: true },
    redirect: { name: 'picks' },
    children: [
      { path: 'picks', name: 'picks', component: () => import('../views/PicksView.vue') },
      { path: 'apuestas', name: 'bets', component: () => import('../views/BetsView.vue') },
      { path: 'caja', name: 'cash', component: () => import('../views/CashView.vue') },
      { path: 'ajustes', name: 'settings', component: () => import('../views/SettingsView.vue') },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  await auth.init();

  if (to.meta.requiresAuth && !auth.user) {
    return { name: 'login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } };
  }
  if (to.meta.guestOnly && auth.user) {
    return { name: 'picks' };
  }
  return true;
});

export default router;
