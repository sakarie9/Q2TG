import { createRouter, createWebHistory } from 'vue-router';
import Index from '@/views/Index';
import ChatRecord from '@/views/ChatRecord';

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/viewer', component: ChatRecord },
    {
      path: '/ui', children: [
        { path: '', component: Index },
        { path: 'chatRecord', component: ChatRecord },
      ],
    },
  ],
});
