<template>
  <div class="breadcrumbs">
    <el-timeline v-if="crumbs.length">
      <el-timeline-item
        v-for="(crumb, index) in crumbs"
        :key="index"
        :timestamp="formatTime(crumb.timestamp)"
        :type="crumbType(crumb)"
        :hollow="crumb.type !== 'error'"
        placement="top"
      >
        <div class="crumb-title">{{ breadcrumbLabel(crumb) }}</div>
        <div class="crumb-detail">{{ breadcrumbDetail(crumb) }}</div>
      </el-timeline-item>
    </el-timeline>
    <el-empty v-else description="无用户行为记录" :image-size="60" />
  </div>
</template>

<script setup>
import { formatTime, breadcrumbLabel, breadcrumbDetail } from '../utils/format';

defineProps({
  crumbs: { type: Array, default: () => [] }
});

function crumbType(crumb) {
  if (crumb?.type === 'error') return 'danger';
  if (crumb?.type === 'click') return 'primary';
  if (crumb?.type === 'route') return 'warning';
  return 'info';
}
</script>

<style scoped>
.crumb-title { font-size: 13px; font-weight: 600; color: #303133; }
.crumb-detail { font-size: 12px; color: #909399; margin-top: 2px; word-break: break-all; }
</style>
