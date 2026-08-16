<template>
  <div v-loading="loading" class="error-detail">
    <el-page-header @back="$router.back()" class="page-header">
      <template #content>
        <span class="header-content">
          <el-tag :type="errorTypeTag(issue.type)" size="small">{{ errorTypeLabel(issue.type) }}</el-tag>
          <span class="issue-message">{{ issue.message || '(无消息)' }}</span>
        </span>
      </template>
      <template #extra>
        <div class="header-actions">
          <el-button v-if="issue.status !== 'resolved'" type="success" plain @click="setStatus('resolved')">
            标记已解决
          </el-button>
          <el-button v-if="issue.status === 'resolved'" plain @click="setStatus('unresolved')">
            重新打开
          </el-button>
          <el-button v-if="issue.status !== 'ignored'" type="info" plain @click="setStatus('ignored')">
            忽略
          </el-button>
        </div>
      </template>
    </el-page-header>

    <el-card shadow="never" class="section">
      <el-descriptions :column="5">
        <el-descriptions-item label="状态">
          <el-tag :type="statusTag(issue.status)" size="small">{{ statusLabel(issue.status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="发生次数">{{ issue.count }}</el-descriptions-item>
        <el-descriptions-item label="影响用户">{{ detail.userDist?.length || '-' }}</el-descriptions-item>
        <el-descriptions-item label="首次发生">{{ formatTime(issue.first_seen) }}</el-descriptions-item>
        <el-descriptions-item label="最近发生">{{ formatTime(issue.last_seen) }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card shadow="never" class="section">
      <el-tabs v-model="tab">
        <el-tab-pane label="事件" name="events">
          <el-table v-loading="eventsLoading" :data="events" @row-click="openEvent" style="cursor: pointer">
            <el-table-column label="时间" width="170">
              <template #default="{ row }">{{ formatTime(row.timestamp) }}</template>
            </el-table-column>
            <el-table-column prop="user_id" label="用户" width="140" show-overflow-tooltip>
              <template #default="{ row }">{{ row.user_id || '-' }}</template>
            </el-table-column>
            <el-table-column prop="page_url" label="页面" min-width="240" show-overflow-tooltip>
              <template #default="{ row }">{{ shortUrl(row.page_url) }}</template>
            </el-table-column>
            <el-table-column label="浏览器 / 系统" width="200">
              <template #default="{ row }">
                <span class="ua-text">{{ uaOf(row).browser }} / {{ uaOf(row).os }}</span>
              </template>
            </el-table-column>
            <el-table-column label="行为轨迹" width="100">
              <template #default="{ row }">
                <el-tag v-if="row.breadcrumbs?.length" size="small" type="info">
                  {{ row.breadcrumbs.length }} 条
                </el-tag>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="会话" width="90">
              <template #default="{ row }">
                <el-tag v-if="row.session_id" size="small" type="success">有</el-tag>
                <span v-else>-</span>
              </template>
            </el-table-column>
          </el-table>

          <div class="pagination-wrap">
            <el-pagination
              v-model:current-page="eventPage"
              :page-size="eventPageSize"
              :total="eventTotal"
              layout="total, prev, pager, next"
              @current-change="fetchEvents"
            />
          </div>
        </el-tab-pane>

        <el-tab-pane label="趋势" name="trend" lazy>
          <div ref="trendChartRef" class="trend-chart" />
        </el-tab-pane>

        <el-tab-pane label="分布" name="dist" lazy>
          <el-row :gutter="16">
            <el-col :span="12">
              <h4 class="dist-title">页面分布</h4>
              <div v-for="item in detail.pageDist" :key="item.page_url" class="dist-row">
                <span class="dist-label" :title="item.page_url">{{ shortUrl(item.page_url) }}</span>
                <el-progress
                  :percentage="pct(item.c, detail.pageDist)"
                  :stroke-width="14"
                  class="dist-bar"
                />
                <span class="dist-count">{{ item.c }}</span>
              </div>
              <el-empty v-if="!detail.pageDist?.length" description="无数据" :image-size="60" />
            </el-col>
            <el-col :span="12">
              <h4 class="dist-title">用户分布</h4>
              <div v-for="item in detail.userDist" :key="item.user_id" class="dist-row">
                <span class="dist-label">{{ item.user_id }}</span>
                <el-progress
                  :percentage="pct(item.c, detail.userDist)"
                  :stroke-width="14"
                  class="dist-bar"
                />
                <span class="dist-count">{{ item.c }}</span>
              </div>
              <el-empty v-if="!detail.userDist?.length" description="无数据" :image-size="60" />
            </el-col>
          </el-row>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 单条事件详情抽屉 -->
    <el-drawer v-model="eventDrawer" title="事件详情" size="52%">
      <template v-if="currentEvent">
        <h4 class="drawer-title">错误信息</h4>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="时间">{{ formatTime(currentEvent.timestamp) }}</el-descriptions-item>
          <el-descriptions-item label="用户">{{ currentEvent.user_id || '-' }}</el-descriptions-item>
          <el-descriptions-item label="页面" :span="2">{{ currentEvent.page_url || '-' }}</el-descriptions-item>
          <el-descriptions-item label="Session ID" :span="2">
            <el-link v-if="replayInfo" type="primary" @click="goReplay">
              {{ currentEvent.session_id }}（点击查看回放）
            </el-link>
            <span v-else>{{ currentEvent.session_id || '-' }}</span>
          </el-descriptions-item>
          <el-descriptions-item v-if="currentEvent.file" label="出错文件" :span="2">
            {{ currentEvent.file }}:{{ currentEvent.line ?? '?' }}:{{ currentEvent.col ?? '?' }}
          </el-descriptions-item>
          <el-descriptions-item v-if="currentEvent.extra?.componentName" label="组件" :span="2">
            {{ currentEvent.extra.componentName }}
          </el-descriptions-item>
        </el-descriptions>

        <div v-if="replayInfo" class="replay-banner">
          <el-button type="primary" size="small" @click="goReplay">
            <el-icon style="margin-right: 4px"><VideoPlay /></el-icon>
            播放该会话录屏（跳到错误发生时刻）
          </el-button>
        </div>

        <h4 class="drawer-title">堆栈</h4>
        <pre v-if="currentEvent.stack" class="stack-block">{{ currentEvent.stack }}</pre>
        <el-empty v-else description="无堆栈信息" :image-size="60" />

        <h4 class="drawer-title">用户行为轨迹（面包屑）</h4>
        <Breadcrumbs :crumbs="currentEvent.breadcrumbs" />

        <template v-if="hasContext(currentEvent)">
          <h4 class="drawer-title">上下文</h4>
          <pre class="stack-block context-block">{{ contextText(currentEvent) }}</pre>
        </template>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { VideoPlay } from '@element-plus/icons-vue';
import Breadcrumbs from '../components/Breadcrumbs.vue';
import { useChart } from '../composables/useChart';
import { getErrorDetail, getErrorEvents, updateErrorStatus, getSessionReplay } from '../api';
import { useAppStore } from '../stores/app';
import { errorTypeLabel, errorTypeTag, formatTime, parseUA, formatShortTime } from '../utils/format';

const route = useRoute();
const router = useRouter();
const store = useAppStore();

const loading = ref(false);
const eventsLoading = ref(false);
const issue = ref({});
const detail = ref({});
const events = ref([]);
const eventTotal = ref(0);
const eventPage = ref(1);
const eventPageSize = 10;
const tab = ref('events');

const eventDrawer = ref(false);
const currentEvent = ref(null);
const replayInfo = ref(null);

const { chartRef: trendChartRef } = useChart(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 40, right: 20, top: 20, bottom: 30 },
  xAxis: {
    type: 'category',
    data: (detail.value.trend || []).map(p => formatShortTime(p.time))
  },
  yAxis: { type: 'value', minInterval: 1 },
  series: [{
    name: '发生次数',
    type: 'bar',
    barMaxWidth: 30,
    itemStyle: { color: '#f56c6c' },
    data: (detail.value.trend || []).map(p => p.count)
  }]
}));

const uaCache = new Map();
function uaOf(row) {
  if (!uaCache.has(row.id)) uaCache.set(row.id, parseUA(row.user_agent));
  return uaCache.get(row.id);
}

function statusTag(status) {
  return { unresolved: 'danger', resolved: 'success', ignored: 'info' }[status] || 'info';
}
function statusLabel(status) {
  return { unresolved: '未解决', resolved: '已解决', ignored: '已忽略' }[status] || status;
}

function shortUrl(url) {
  if (!url) return '-';
  try { const u = new URL(url); return `${u.pathname}${u.search}`.slice(0, 60); } catch { return url.slice(0, 60); }
}

function pct(c, list) {
  const max = Math.max(...(list || []).map(i => i.c), 1);
  return Math.round((c / max) * 100);
}

function hasContext(ev) {
  return Object.keys(ev?.context || {}).length > 0 || Object.keys(ev?.extra || {}).length > 0;
}

function contextText(ev) {
  return JSON.stringify({ context: ev.context, extra: ev.extra }, null, 2);
}

async function fetchEvents() {
  eventsLoading.value = true;
  try {
    const result = await getErrorEvents(route.params.id, { page: eventPage.value, pageSize: eventPageSize });
    events.value = result.items;
    eventTotal.value = result.total;
  } finally {
    eventsLoading.value = false;
  }
}

async function openEvent(row) {
  currentEvent.value = row;
  replayInfo.value = null;
  eventDrawer.value = true;
  if (row.session_id) {
    try {
      replayInfo.value = await getSessionReplay(store.currentAppKey, row.session_id);
    } catch { replayInfo.value = null; }
  }
}

function goReplay() {
  router.push({
    path: '/replays',
    query: { replayId: String(replayInfo.value.id), autoSeek: '1' }
  });
}

async function setStatus(status) {
  await updateErrorStatus(route.params.id, status);
  issue.value.status = status;
  ElMessage.success(status === 'resolved' ? '已标记为已解决' : status === 'ignored' ? '已忽略' : '已重新打开');
}

onMounted(async () => {
  loading.value = true;
  try {
    detail.value = await getErrorDetail(route.params.id);
    issue.value = detail.value;
    await fetchEvents();
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.page-header { background: #fff; padding: 16px 20px; border-radius: 8px; }
.header-content { display: flex; align-items: center; gap: 8px; min-width: 0; }
.header-actions { display: flex; gap: 8px; }
.issue-message {
  font-weight: 600;
  font-size: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 560px;
}
.section { margin-top: 16px; }
.ua-text { font-size: 12px; color: #606266; }
.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
.trend-chart { height: 300px; }
.dist-title { margin: 8px 0 12px; color: #303133; }
.dist-row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.dist-label {
  width: 200px;
  font-size: 13px;
  color: #606266;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dist-bar { flex: 1; }
.dist-count { width: 40px; text-align: right; font-size: 13px; color: #303133; }
.drawer-title { margin: 20px 0 10px; color: #303133; font-size: 14px; }
.drawer-title:first-child { margin-top: 0; }
.stack-block {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 14px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.7;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
.context-block { background: #f5f7fa; color: #606266; max-height: 240px; overflow-y: auto; }
.replay-banner { margin-top: 14px; }
</style>
