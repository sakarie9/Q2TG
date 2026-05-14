import { createRouter, createWebHistory } from 'vue-router';
import Index from '@/views/Index';
import ChatRecord from '@/views/ChatRecord';
import TestView from '@/views/ChatRecord/TestView';

export default createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/ui', children: [
        { path: '', component: Index },
        { path: 'chatRecord', component: ChatRecord },
        { path: 'testChatRecord', component: TestView },
      ],
    },
  ],
});
