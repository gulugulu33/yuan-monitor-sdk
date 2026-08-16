<template>
  <div class="replay-view">
    <!-- 播放模式 -->
    <template v-if="mode === 'play'">
      <div class="play-header">
        <el-page-header @back="backToList">
          <template #content>
            <span class="session-info">
              会话 {{ replay.session_id }} · 用户 {{ replay.user_id || '-' }} ·
              时长 {{ fmtDuration(replay.duration) }} · {{ replay.event_count }} 个事件
              <el-tag v-if="replay.error_count > 0" type="danger" size="small" style="margin-left: 8px">
                {{ replay.error_count }} 个错误
              </el-tag>
            </span>
          </template>
        </el-page-header>
      </div>
      <div v-loading="loadingReplay" class="player-wrap">
        <ReplayPlayer
          v-if="replay.events && replay.events.length"
          :events="replay.events"
          :error-offset="replay.error_offset"
          :auto-seek-error="autoSeek"
        />
        <el-empty v-else-if="!loadingReplay" description="该录屏没有事件数据" />
      </div>
    </template>

    <!-- 列表模式 -->
    <el-card v-else shadow="never">
      <div class="filter-bar">
        <el-input
          v-model="sessionId"
          placeholder="按 Session ID 精确过滤"
          clearable
          style="width: 300px"
          @keyup.enter="fetchList"
          @clear="fetchList"
        >
          <template #append>
            <el-button @click="fetchList">查询</el-button>
          </template>
        </el-input>
      </div>

      <el-table v-loading="loading" :data="items" style="cursor: pointer" @row-click="openReplay">
        <el-table-column label="录制时间" width="180">
          <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column prop="session_id" label="Session ID" min-width="220" show-overflow-tooltip />
        <el-table-column prop="user_id" label="用户" width="130">
          <template #default="{ row }">{{ row.user_id || '-' }}</template>
        </el-table-column>
        <el-table-column label="时长" width="110">
          <template #default="{ row }">{{ fmtDuration(row.duration) }}</template>
        </el-table-column>
        <el-table-column prop="event_count" label="事件数" width="90" />
        <el-table-column label="错误数" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.error_count > 0" type="danger" size="small">{{ row.error_count }}</el-tag>
            <span v-else>0</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" @click.stop="openReplay(row)">播放</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无录屏数据。接入 SDK 并开启 enableSessionReplay 后会自动录制。" />
        </template>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="fetchList"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ReplayPlayer from '../components/ReplayPlayer.vue';
import { getReplays, getReplay } from '../api';
import { useAppStore } from '../stores/app';
import { formatTime } from '../utils/format';

const route = useRoute();
const router = useRouter();
const store = useAppStore();

const mode = ref('list');
const loading = ref(false);
const loadingReplay = ref(false);
const items = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 15;
const sessionId = ref('');

const replay = ref({});
const autoSeek = ref(false);

function fmtDuration(ms) {
  if (!ms && ms !== 0) return '-';
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  return `${Math.floor(s / 60)} 分 ${Math.round(s % 60)} 秒`;
}

async function fetchList() {
  loading.value = true;
  try {
    const params = { appKey: store.currentAppKey, page: page.value, pageSize };
    if (sessionId.value) params.sessionId = sessionId.value;
    const result = await getReplays(params);
    items.value = result.items;
    total.value = result.total;
  } finally {
    loading.value = false;
  }
}

async function openReplay(row, seek = false) {
  loadingReplay.value = true;
  mode.value = 'play';
  autoSeek.value = seek;
  try {
    const data = await getReplay(row.id);
    replay.value = data;
  } finally {
    loadingReplay.value = false;
  }
}

function backToList() {
  mode.value = 'list';
  replay.value = {};
  router.replace({ path: '/replays' });
  fetchList();
}

onMounted(async () => {
  await fetchList();
  // 支持从错误详情跳转：/replays?replayId=xxx&autoSeek=1
  if (route.query.replayId) {
    const row = { id: route.query.replayId };
    openReplay(row, route.query.autoSeek === '1');
  }
});
</script>

<style scoped>
.filter-bar { margin-bottom: 16px; }
.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
.play-header {
  background: #fff;
  padding: 16px 20px;
  border-radius: 8px;
  margin-bottom: 16px;
}
.session-info { font-size: 14px; color: #303133; }
.player-wrap { min-height: 480px; }
</style>
