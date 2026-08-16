import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    name: 'dashboard',
    component: () => import('../views/Dashboard.vue'),
    meta: { title: '总览' }
  },
  {
    path: '/errors',
    name: 'errors',
    component: () => import('../views/ErrorList.vue'),
    meta: { title: '错误' }
  },
  {
    path: '/errors/:id',
    name: 'error-detail',
    component: () => import('../views/ErrorDetail.vue'),
    meta: { title: '错误详情' }
  },
  {
    path: '/performance',
    name: 'performance',
    component: () => import('../views/Performance.vue'),
    meta: { title: '性能' }
  },
  {
    path: '/replays',
    name: 'replays',
    component: () => import('../views/Replay.vue'),
    meta: { title: '会话回放' }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

export default router;
