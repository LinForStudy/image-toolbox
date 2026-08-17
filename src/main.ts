import { startupLoading } from './startup-loading';
startupLoading.report(12, '正在初始化应用…');
import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';

createApp(App).mount('#app'); requestAnimationFrame(() => startupLoading.ready())
