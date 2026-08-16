<template>
  <el-container class="layout">
    <el-aside width="220px" class="aside">
      <div class="logo">
        <span class="logo-mark">Y</span>
        <span class="logo-text">Yuan APM</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        router
        class="menu"
        background-color="#1d2535"
        text-color="#9aa5b8"
        active-text-color="#ffffff"
      >
        <el-menu-item index="/">
          <el-icon><Odometer /></el-icon>
          <span>总览</span>
        </el-menu-item>
        <el-menu-item index="/errors">
          <el-icon><WarningFilled /></el-icon>
          <span>错误</span>
        </el-menu-item>
        <el-menu-item index="/performance">
          <el-icon><DataLine /></el-icon>
          <span>性能</span>
        </el-menu-item>
        <el-menu-item index="/replays">
          <el-icon><VideoPlay /></el-icon>
          <span>会话回放</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="header-left">
          <el-select
            v-model="store.currentAppKey"
            placeholder="选择应用"
            style="width: 220px"
            @change="onAppChange"
          >
            <el-option
              v-for="app in store.apps"
              :key="app.app_key"
              :label="app.name || app.app_key"
              :value="app.app_key"
            >
              <span>{{ app.name || app.app_key }}</span>
              <el-tag v-if="app.errorCount24h > 0" type="danger" size="small" style="margin-left: 8px">
                {{ app.errorCount24h }}
              </el-tag>
            </el-option>
          </el-select>
          <span v-if="!store.apps.length && store.loaded" class="empty-hint">
            暂无应用，请先在业务项目中接入 yuan-monitor-sdk 并上报数据
          </span>
        </div>
        <el-radio-group v-model="store.range" size="default" @change="onRangeChange">
          <el-radio-button value="1h">近 1 小时</el-radio-button>
          <el-radio-button value="24h">近 24 小时</el-radio-button>
          <el-radio-button value="7d">近 7 天</el-radio-button>
        </el-radio-group>
      </el-header>

      <el-main class="main">
        <router-view v-if="store.currentAppKey" :key="store.currentAppKey + ':' + store.range" />
        <el-empty
          v-else-if="store.loaded"
          description="尚无上报数据。接入 yuan-monitor-sdk 后，上报的应用会自动出现在这里。"
        />
        <div v-else class="loading-wrap">
          <el-skeleton :rows="6" animated />
        </div>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { Odometer, WarningFilled, VideoPlay, DataLine } from '@element-plus/icons-vue';
import { useAppStore } from './stores/app';

const store = useAppStore();
const route = useRoute();
const loading = ref(false);

const activeMenu = computed(() => {
  if (route.path.startsWith('/errors/')) return '/errors';
  if (route.path.startsWith('/performance')) return '/performance';
  if (route.path.startsWith('/replays')) return '/replays';
  return route.path;
});

function onAppChange() {
  store.setCurrentApp(store.currentAppKey);
}
function onRangeChange(value) {
  store.setRange(value);
}

onMounted(async () => {
  loading.value = true;
  try {
    await store.loadApps();
  } finally {
    loading.value = false;
  }
});
</script>

<style>
html, body, #app { height: 100%; margin: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
</style>

<style scoped>
.layout { height: 100vh; }

.aside {
  background: #1d2535;
  display: flex;
  flex-direction: column;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 60px;
  padding: 0 20px;
  color: #fff;
}

.logo-mark {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: #409eff;
  color: #fff;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-text { font-size: 17px; font-weight: 600; }

.menu { border-right: none; flex: 1; }

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e4e7ed;
  background: #fff;
}

.header-left { display: flex; align-items: center; gap: 12px; }

.empty-hint { color: #909399; font-size: 13px; }

.main { background: #f0f2f5; overflow-y: auto; }

.loading-wrap { background: #fff; border-radius: 8px; padding: 24px; }
</style>
