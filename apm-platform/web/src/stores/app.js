import { defineStore } from 'pinia';
import { getApps } from '../api';

export const useAppStore = defineStore('app', {
  state: () => ({
    apps: [],
    currentAppKey: localStorage.getItem('apm:appKey') || '',
    range: localStorage.getItem('apm:range') || '24h',
    loaded: false
  }),
  getters: {
    currentApp: (state) => state.apps.find(a => a.app_key === state.currentAppKey) || null
  },
  actions: {
    async loadApps() {
      const apps = await getApps();
      this.apps = apps;
      this.loaded = true;
      if (!this.currentAppKey && apps.length) {
        this.setCurrentApp(apps[0].app_key);
      }
    },
    setCurrentApp(appKey) {
      this.currentAppKey = appKey;
      localStorage.setItem('apm:appKey', appKey);
    },
    setRange(range) {
      this.range = range;
      localStorage.setItem('apm:range', range);
    }
  }
});
