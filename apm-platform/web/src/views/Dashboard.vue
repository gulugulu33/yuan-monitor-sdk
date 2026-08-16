<template>
  <div v-loading="loading" class="dashboard">
    <el-row :gutter="16">
      <el-col :span="6">
        <StatCard label="错误事件" :value="data.errorCount" sub="时间范围内的错误发生次数" />
      </el-col>
      <el-col :span="6">
        <StatCard label="未解决 Issue" :value="data.unresolvedCount" :sub="`共 ${data.issueCount} 个 Issue`" />
      </el-col>
      <el-col :span="6">
        <StatCard label="影响用户" :value="data.affectedUsers" sub="发生错误的独立用户数" />
      </el-col>
      <el-col :span="6">
        <StatCard
          label="LCP P75"
          :value="formatVital('LCP', data.vitals?.LCP?.p75)"
          :sub="`采样 ${data.vitals?.LCP?.count ?? 0} 次`"
          :color="ratingColor('LCP', data.vitals?.LCP?.p75)"
        />
      </el-col>
    </el-row>

    <el-row :gutter="16" class="section">
      <el-col :span="16">
        <el-card shadow="never">
          <template #header>错误趋势</template>
          <div ref="chartRef" class="trend-chart" />
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="never">
          <template #header>Web Vitals</template>
          <div class="vitals-list">
            <div v-for="name in vitalNames" :key="name" class="vital-row">
              <span class="vital-name">{{ name }}</span>
              <span class="vital-value" :style="{ color: ratingColor(name, data.vitals?.[name]?.p75) }">
                {{ formatVital(name, data.vitals?.[name]?.p75) }}
              </span>
              <span class="vital-count">{{ data.vitals?.[name]?.count ?? 0 }} 次</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="section">
      <template #header>
        <div class="card-header">
          <span>Top Issues</span>
          <el-button text type="primary" @click="$router.push('/errors')">查看全部</el-button>
        </div>
      </template>
      <el-table :data="data.topIssues" @row-click="goDetail" style="cursor: pointer">
        <el-table-column label="级别" width="100">
          <template #default="{ row }">
            <el-tag :type="errorTypeTag(row.type)" size="small">{{ errorTypeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="message" label="消息" show-overflow-tooltip min-width="300" />
        <el-table-column prop="count" label="次数" width="90" sortable />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最近发生" width="140">
          <template #default="{ row }">{{ fromNow(row.last_seen) }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import StatCard from '../components/StatCard.vue';
import { useChart } from '../composables/useChart';
import { useAppStore } from '../stores/app';
import { getOverview } from '../api';
import { formatVital, vitalRating, fromNow, errorTypeLabel, errorTypeTag, formatShortTime } from '../utils/format';

const store = useAppStore();
const router = useRouter();
const loading = ref(false);
const data = ref({ trend: [], topIssues: [], vitals: {} });
const vitalNames = ['LCP', 'FCP', 'CLS', 'FID', 'TTFB'];

const ratingColors = {
  good: '#67c23a',
  'needs-improvement': '#e6a23c',
  poor: '#f56c6c',
  unknown: '#909399'
};

function ratingColor(name, value) {
  return ratingColors[vitalRating(name, value)];
}

function statusTag(status) {
  return { unresolved: 'danger', resolved: 'success', ignored: 'info' }[status] || 'info';
}
function statusLabel(status) {
  return { unresolved: '未解决', resolved: '已解决', ignored: '已忽略' }[status] || status;
}

const { chartRef } = useChart(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 40, right: 20, top: 20, bottom: 30 },
  xAxis: {
    type: 'category',
    data: data.value.trend.map(p => formatShortTime(p.time)),
    axisLine: { lineStyle: { color: '#dcdfe6' } }
  },
  yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#f0f2f5' } } },
  series: [{
    name: '错误数',
    type: 'line',
    smooth: true,
    symbol: 'circle',
    symbolSize: 6,
    data: data.value.trend.map(p => p.count),
    itemStyle: { color: '#409eff' },
    areaStyle: {
      color: {
        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [
          { offset: 0, color: 'rgba(64,158,255,0.25)' },
          { offset: 1, color: 'rgba(64,158,255,0.02)' }
        ]
      }
    }
  }]
}));

function goDetail(row) {
  router.push(`/errors/${row.id}`);
}

onMounted(async () => {
  loading.value = true;
  try {
    data.value = await getOverview({ appKey: store.currentAppKey, range: store.range });
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.dashboard { min-height: 100%; }
.section { margin-top: 16px; }
.trend-chart { height: 320px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }

.vitals-list { display: flex; flex-direction: column; gap: 4px; }

.vital-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 4px;
  border-bottom: 1px solid #f0f2f5;
}
.vital-row:last-child { border-bottom: none; }
.vital-name { color: #606266; font-weight: 500; }
.vital-value { font-weight: 600; font-variant-numeric: tabular-nums; }
.vital-count { color: #c0c4cc; font-size: 12px; }
</style>
