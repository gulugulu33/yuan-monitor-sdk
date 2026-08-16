<template>
  <div v-loading="loading" class="performance">
    <!-- Web Vitals 卡片 -->
    <div class="vitals-row">
      <div v-for="name in vitalNames" :key="name" class="vital-card">
        <div class="vital-head">
          <span class="vital-name">{{ name }}</span>
          <span class="vital-desc">{{ VITAL_DESC[name] }}</span>
        </div>
        <div class="vital-p75" :style="{ color: ratingColor(name, data.vitals?.[name]?.p75) }">
          {{ formatVital(name, data.vitals?.[name]?.p75) }}
        </div>
        <div class="vital-meta">P75 · 采样 {{ data.vitals?.[name]?.count ?? 0 }} 次</div>
        <div class="rating-bar">
          <div class="rating-seg good" :style="{ width: segWidth(name, 'good') }" />
          <div class="rating-seg needs" :style="{ width: segWidth(name, 'needs-improvement') }" />
          <div class="rating-seg poor" :style="{ width: segWidth(name, 'poor') }" />
        </div>
        <div class="rating-legend">
          <span>良好 {{ data.vitals?.[name]?.rating?.good ?? 0 }}</span>
          <span>待改进 {{ data.vitals?.[name]?.rating?.['needs-improvement'] ?? 0 }}</span>
          <span>差 {{ data.vitals?.[name]?.rating?.poor ?? 0 }}</span>
        </div>
      </div>
    </div>

    <el-row :gutter="16" class="section">
      <!-- 指标趋势 -->
      <el-col :span="14">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span>指标趋势（P75）</span>
              <el-radio-group v-model="trendMetric" size="small">
                <el-radio-button v-for="n in vitalNames" :key="n" :value="n">{{ n }}</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <div ref="trendChartRef" class="trend-chart" />
        </el-card>
      </el-col>

      <!-- 页面性能排行 -->
      <el-col :span="10">
        <el-card shadow="never">
          <template #header>页面性能排行（按 LCP P75）</template>
          <el-table :data="data.pages" size="small">
            <el-table-column label="页面" min-width="150" show-overflow-tooltip>
              <template #default="{ row }">{{ shortUrl(row.page_url) }}</template>
            </el-table-column>
            <el-table-column label="采样" width="60">
              <template #default="{ row }">{{ row.count }}</template>
            </el-table-column>
            <el-table-column label="LCP P75" width="95">
              <template #default="{ row }">
                <span :style="{ color: ratingColor('LCP', row.lcp75) }">{{ formatVital('LCP', row.lcp75) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="FCP P75" width="95">
              <template #default="{ row }">
                <span :style="{ color: ratingColor('FCP', row.fcp75) }">{{ formatVital('FCP', row.fcp75) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="CLS P75" width="80">
              <template #default="{ row }">{{ formatVital('CLS', row.cls75) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <!-- 资源 / 长任务 -->
    <el-card shadow="never" class="section">
      <el-tabs v-model="tab" @tab-change="onTabChange">
        <el-tab-pane label="慢资源" name="resources">
          <div class="filter-bar">
            <el-input
              v-model="resKeyword"
              placeholder="按资源 URL 过滤"
              clearable
              style="width: 280px"
              @keyup.enter="fetchResources"
              @clear="fetchResources"
            >
              <template #append><el-button @click="fetchResources">查询</el-button></template>
            </el-input>
            <el-select v-model="resType" placeholder="类型" clearable style="width: 140px" @change="fetchResources">
              <el-option v-for="t in initiatorTypes" :key="t" :label="t" :value="t" />
            </el-select>
            <el-radio-group v-model="resSort" @change="fetchResources">
              <el-radio-button value="duration">最慢优先</el-radio-button>
              <el-radio-button value="recent">最近优先</el-radio-button>
            </el-radio-group>
          </div>
          <el-table v-loading="resLoading" :data="resources" size="small">
            <el-table-column label="资源" min-width="280" show-overflow-tooltip>
              <template #default="{ row }">{{ row.name || '-' }}</template>
            </el-table-column>
            <el-table-column label="耗时" width="100" sortable prop="duration">
              <template #default="{ row }">
                <span :style="{ color: row.duration > 1000 ? '#f56c6c' : row.duration > 300 ? '#e6a23c' : '#67c23a' }">
                  {{ formatMs(row.duration) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="initiatorType" label="类型" width="110" />
            <el-table-column label="大小" width="90">
              <template #default="{ row }">
                <el-tag v-if="row.isCache" size="small" type="info">缓存</el-tag>
                <span v-else>{{ formatBytes(row.transferSize) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="协议" width="80">
              <template #default="{ row }">{{ row.protocol }}</template>
            </el-table-column>
            <el-table-column label="时间" width="140">
              <template #default="{ row }">{{ formatTime(row.timestamp) }}</template>
            </el-table-column>
          </el-table>
          <div class="pagination-wrap">
            <el-pagination
              v-model:current-page="resPage"
              :page-size="resPageSize"
              :total="resTotal"
              layout="total, prev, pager, next"
              @current-change="fetchResources"
            />
          </div>
        </el-tab-pane>

        <el-tab-pane label="长任务" name="longTasks">
          <div class="filter-bar">
            <span class="filter-label">最短时长</span>
            <el-select v-model="minDuration" style="width: 120px" @change="fetchLongTasks">
              <el-option label="≥ 50 ms" :value="50" />
              <el-option label="≥ 200 ms" :value="200" />
              <el-option label="≥ 500 ms" :value="500" />
            </el-select>
            <span class="filter-hint">长任务会阻塞主线程，造成卡顿（Click/FID 变差）</span>
          </div>
          <el-table v-loading="taskLoading" :data="longTasks" size="small">
            <el-table-column label="耗时" width="110" sortable prop="duration">
              <template #default="{ row }">
                <span :style="{ color: row.duration > 500 ? '#f56c6c' : '#e6a23c' }">{{ formatMs(row.duration) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="发生位置" width="110">
              <template #default="{ row }">{{ row.containerType }}</template>
            </el-table-column>
            <el-table-column label="相关脚本" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">{{ row.scriptUrl }}</template>
            </el-table-column>
            <el-table-column label="页面" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">{{ shortUrl(row.page_url) }}</template>
            </el-table-column>
            <el-table-column label="时间" width="140">
              <template #default="{ row }">{{ formatTime(row.timestamp) }}</template>
            </el-table-column>
          </el-table>
          <div class="pagination-wrap">
            <el-pagination
              v-model:current-page="taskPage"
              :page-size="taskPageSize"
              :total="taskTotal"
              layout="total, prev, pager, next"
              @current-change="fetchLongTasks"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useChart } from '../composables/useChart';
import { useAppStore } from '../stores/app';
import { getPerformance, getResources, getLongTasks } from '../api';
import {
  formatVital, vitalRating, formatMs, formatBytes, formatTime, formatShortTime
} from '../utils/format';

const store = useAppStore();
const vitalNames = ['LCP', 'FCP', 'CLS', 'FID', 'TTFB'];
const VITAL_DESC = {
  LCP: '最大内容绘制',
  FCP: '首次内容绘制',
  CLS: '累积布局偏移',
  FID: '首次输入延迟',
  TTFB: '首字节时间'
};
const initiatorTypes = ['script', 'link', 'img', 'css', 'xmlhttprequest', 'fetch'];

const loading = ref(false);
const data = ref({ vitals: {}, trend: {}, pages: [] });
const trendMetric = ref('LCP');
const tab = ref('resources');

const ratingColors = {
  good: '#67c23a',
  'needs-improvement': '#e6a23c',
  poor: '#f56c6c',
  unknown: '#909399'
};

function ratingColor(name, value) {
  return ratingColors[vitalRating(name, value)];
}

function segWidth(name, level) {
  const r = data.value.vitals?.[name]?.rating;
  if (!r || !r.good && !r.poor && !r['needs-improvement']) return '0%';
  const total = r.good + r['needs-improvement'] + r.poor;
  return `${Math.round((r[level] / total) * 100)}%`;
}

function shortUrl(url) {
  if (!url) return '-';
  try { const u = new URL(url); return `${u.pathname}${u.search}`.slice(0, 60); } catch { return url.slice(0, 60); }
}

const { chartRef: trendChartRef } = useChart(() => {
  const metric = trendMetric.value;
  const series = data.value.trend?.[metric] || [];
  return {
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v) => formatVital(metric, v)
    },
    grid: { left: 60, right: 20, top: 30, bottom: 30 },
    xAxis: {
      type: 'category',
      data: series.map(p => formatShortTime(p.time)),
      axisLine: { lineStyle: { color: '#dcdfe6' } }
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: (v) => metric === 'CLS' ? v : `${(v / 1000).toFixed(1)}s` },
      splitLine: { lineStyle: { color: '#f0f2f5' } }
    },
    series: [{
      name: `${metric} P75`,
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      data: series.map(p => p.p75),
      itemStyle: { color: '#409eff' },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(64,158,255,0.22)' },
            { offset: 1, color: 'rgba(64,158,255,0.02)' }
          ]
        }
      }
    }]
  };
});

// ---------- 慢资源 ----------
const resources = ref([]);
const resTotal = ref(0);
const resPage = ref(1);
const resPageSize = 15;
const resLoading = ref(false);
const resKeyword = ref('');
const resType = ref('');
const resSort = ref('duration');

async function fetchResources() {
  resLoading.value = true;
  try {
    const params = {
      appKey: store.currentAppKey, range: store.range,
      page: resPage.value, pageSize: resPageSize, sort: resSort.value
    };
    if (resKeyword.value) params.keyword = resKeyword.value;
    if (resType.value) params.initiatorType = resType.value;
    const result = await getResources(params);
    resources.value = result.items;
    resTotal.value = result.total;
  } finally {
    resLoading.value = false;
  }
}

// ---------- 长任务 ----------
const longTasks = ref([]);
const taskTotal = ref(0);
const taskPage = ref(1);
const taskPageSize = 15;
const taskLoading = ref(false);
const minDuration = ref(50);

async function fetchLongTasks() {
  taskLoading.value = true;
  try {
    const result = await getLongTasks({
      appKey: store.currentAppKey, range: store.range,
      page: taskPage.value, pageSize: taskPageSize, minDuration: minDuration.value
    });
    longTasks.value = result.items;
    taskTotal.value = result.total;
  } finally {
    taskLoading.value = false;
  }
}

function onTabChange(name) {
  if (name === 'longTasks' && !longTasks.value.length) fetchLongTasks();
}

onMounted(async () => {
  loading.value = true;
  try {
    data.value = await getPerformance({ appKey: store.currentAppKey, range: store.range });
    await fetchResources();
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.vitals-row {
  display: flex;
  gap: 12px;
}

.vital-card {
  flex: 1;
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  min-width: 0;
}

.vital-head { display: flex; align-items: baseline; gap: 8px; }
.vital-name { font-size: 15px; font-weight: 700; color: #303133; }
.vital-desc { font-size: 12px; color: #c0c4cc; }

.vital-p75 { font-size: 26px; font-weight: 600; margin-top: 8px; font-variant-numeric: tabular-nums; }
.vital-meta { color: #909399; font-size: 12px; margin-top: 4px; }

.rating-bar {
  display: flex;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  margin-top: 12px;
  background: #f0f2f5;
}
.rating-seg.good { background: #67c23a; }
.rating-seg.needs { background: #e6a23c; }
.rating-seg.poor { background: #f56c6c; }

.rating-legend {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 11px;
  color: #909399;
}

.section { margin-top: 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.trend-chart { height: 300px; }
.filter-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
.filter-label { color: #606266; font-size: 13px; }
.filter-hint { color: #c0c4cc; font-size: 12px; }
.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 14px; }
</style>
