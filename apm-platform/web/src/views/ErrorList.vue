<template>
  <div class="error-list">
    <el-card shadow="never">
      <div class="filter-bar">
        <el-select v-model="filters.type" placeholder="错误类型" clearable style="width: 160px" @change="fetchList">
          <el-option v-for="(label, value) in typeOptions" :key="value" :label="label" :value="value" />
        </el-select>
        <el-select v-model="filters.status" placeholder="状态" clearable style="width: 140px" @change="fetchList">
          <el-option label="未解决" value="unresolved" />
          <el-option label="已解决" value="resolved" />
          <el-option label="已忽略" value="ignored" />
        </el-select>
        <el-select v-model="filters.sort" style="width: 150px" @change="fetchList">
          <el-option label="按最近发生" value="recent" />
          <el-option label="按发生次数" value="count" />
        </el-select>
        <el-input
          v-model="filters.keyword"
          placeholder="搜索消息或堆栈"
          clearable
          style="width: 260px"
          @keyup.enter="fetchList"
          @clear="fetchList"
        >
          <template #append>
            <el-button @click="fetchList">搜索</el-button>
          </template>
        </el-input>
        <el-radio-group v-model="filters.range" @change="fetchList">
          <el-radio-button value="24h">24h</el-radio-button>
          <el-radio-button value="7d">7d</el-radio-button>
        </el-radio-group>
      </div>

      <el-table v-loading="loading" :data="items" @row-click="goDetail" style="cursor: pointer">
        <el-table-column label="级别" width="110">
          <template #default="{ row }">
            <el-tag :type="errorTypeTag(row.type)" size="small">{{ errorTypeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="message" label="消息" min-width="320" show-overflow-tooltip />
        <el-table-column prop="count" label="次数" width="90" />
        <el-table-column prop="affected_users" label="影响用户" width="90" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="首次发生" width="150">
          <template #default="{ row }">{{ formatTime(row.first_seen) }}</template>
        </el-table-column>
        <el-table-column label="最近发生" width="150">
          <template #default="{ row }">{{ formatTime(row.last_seen) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" @click.stop="goDetail(row)">详情</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="时间范围内没有错误数据" />
        </template>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next, jumper"
          @current-change="fetchList"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getErrors } from '../api';
import { useAppStore } from '../stores/app';
import { errorTypeLabel, errorTypeTag, formatTime } from '../utils/format';

const store = useAppStore();
const router = useRouter();

const typeOptions = {
  js_error: 'JS 错误',
  runtime: 'JS 错误',
  promise: 'Promise 异常',
  promise_rejection: 'Promise 异常',
  resource: '资源错误',
  resource_error: '资源错误',
  vue: 'Vue 错误',
  vue_error: 'Vue 错误',
  manual: '手动上报',
  white_screen: '白屏'
};

const filters = reactive({ type: '', status: '', keyword: '', sort: 'recent', range: '7d' });
const items = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const loading = ref(false);

function statusTag(status) {
  return { unresolved: 'danger', resolved: 'success', ignored: 'info' }[status] || 'info';
}
function statusLabel(status) {
  return { unresolved: '未解决', resolved: '已解决', ignored: '已忽略' }[status] || status;
}

function goDetail(row) {
  router.push(`/errors/${row.id}`);
}

async function fetchList() {
  loading.value = true;
  try {
    const params = {
      appKey: store.currentAppKey,
      page: page.value,
      pageSize,
      sort: filters.sort,
      range: filters.range
    };
    if (filters.type) params.type = filters.type;
    if (filters.status) params.status = filters.status;
    if (filters.keyword) params.keyword = filters.keyword;

    const result = await getErrors(params);
    items.value = result.items;
    total.value = result.total;
  } finally {
    loading.value = false;
  }
}

onMounted(fetchList);
</script>

<style scoped>
.filter-bar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
