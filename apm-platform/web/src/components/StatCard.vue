<template>
  <div class="stat-card">
    <div class="stat-label">{{ label }}</div>
    <div class="stat-value" :style="{ color }">{{ displayValue }}</div>
    <div v-if="sub" class="stat-sub">{{ sub }}</div>
    <slot />
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], default: '-' },
  sub: { type: String, default: '' },
  color: { type: String, default: '#303133' }
});

const displayValue = computed(() => {
  if (props.value === null || props.value === undefined) return '-';
  return props.value;
});
</script>

<style scoped>
.stat-card {
  background: #fff;
  border-radius: 8px;
  padding: 18px 20px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.stat-label { color: #909399; font-size: 13px; }

.stat-value {
  font-size: 28px;
  font-weight: 600;
  margin-top: 8px;
  font-variant-numeric: tabular-nums;
}

.stat-sub { color: #909399; font-size: 12px; margin-top: 6px; }
</style>
