<template>
  <div class="replay-player">
    <div ref="playerRoot" class="player-root" />
    <div class="controls">
      <el-button
        circle
        :type="playing ? 'warning' : 'primary'"
        :icon="playing ? 'VideoPause' : 'VideoPlay'"
        @click="togglePlay"
      />
      <span class="time-text">{{ fmtTime(currentMs) }} / {{ fmtTime(totalMs) }}</span>
      <el-slider
        v-model="sliderValue"
        :min="0"
        :max="totalMs"
        :step="100"
        :marks="errorMarks"
        :format-tooltip="fmtTime"
        class="progress"
        @input="onSeek"
      />
      <el-select v-model="speed" style="width: 88px" @change="onSpeedChange">
        <el-option v-for="s in [1, 2, 4, 8]" :key="s" :label="`${s}x`" :value="s" />
      </el-select>
      <el-button v-if="errorOffset >= 0" size="small" type="danger" plain @click="jumpToError">
        跳到错误
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Replayer } from 'rrweb';
import { VideoPause, VideoPlay } from '@element-plus/icons-vue';

const props = defineProps({
  events: { type: Array, required: true },
  errorOffset: { type: Number, default: -1 },
  autoSeekError: { type: Boolean, default: false }
});

const playerRoot = ref(null);
const playing = ref(false);
const totalMs = ref(0);
const currentMs = ref(0);
const sliderValue = ref(0);
const speed = ref(1);

let replayer = null;
let offsetBase = 0;      // 播放/暂停基准偏移
let wallStart = 0;       // 播放起始 wallclock
let ticker = null;

const errorMarks = computed(() =>
  props.errorOffset >= 0 && props.errorOffset <= totalMs.value
    ? { [props.errorOffset]: { label: '错误', style: { color: '#f56c6c' } } }
    : {}
);

function fmtTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function computeCurrent() {
  if (!playing.value) return offsetBase;
  return offsetBase + (performance.now() - wallStart) * speed.value;
}

function togglePlay() {
  if (playing.value) {
    pause();
  } else {
    const from = Math.min(computeCurrent(), totalMs.value - 100);
    play(from >= totalMs.value - 100 ? 0 : from);
  }
}

function play(from = 0) {
  if (!replayer || !totalMs.value) return;
  offsetBase = Math.max(0, Math.min(from, totalMs.value));
  replayer.play(offsetBase);
  wallStart = performance.now();
  playing.value = true;
}

function pause() {
  if (!replayer) return;
  offsetBase = Math.min(computeCurrent(), totalMs.value);
  replayer.pause();
  playing.value = false;
  currentMs.value = offsetBase;
}

function onSeek(value) {
  const target = Math.max(0, Math.min(Number(value), totalMs.value));
  offsetBase = target;
  currentMs.value = target;
  if (!replayer) return;
  if (playing.value) {
    replayer.play(target);
    wallStart = performance.now();
  } else {
    // 暂停态跳帧：play 到目标时刻后立即暂停，保留目标帧画面
    replayer.play(target);
    replayer.pause();
  }
}

function onSpeedChange(value) {
  if (!replayer) return;
  const at = computeCurrent();
  replayer.setConfig({ speed: value });
  if (playing.value) {
    offsetBase = Math.min(at, totalMs.value);
    replayer.play(offsetBase);
    wallStart = performance.now();
  } else {
    offsetBase = Math.min(at, totalMs.value);
    currentMs.value = offsetBase;
  }
}

function jumpToError() {
  onSeek(props.errorOffset);
}

function initPlayer() {
  if (!props.events?.length || !playerRoot.value) return;
  replayer = new Replayer(props.events, {
    root: playerRoot.value,
    skipInactive: false,
    speed: speed.value,
    mouseTail: true
  });
  const meta = replayer.getMetaData();
  totalMs.value = Math.max(0, Math.round(meta.totalTime));

  replayer.on('finish', () => {
    playing.value = false;
    offsetBase = totalMs.value;
    currentMs.value = totalMs.value;
  });

  // 初始渲染第一帧并保持暂停
  replayer.play(0);
  replayer.pause();
  currentMs.value = 0;

  if (props.autoSeekError && props.errorOffset >= 0 && props.errorOffset <= totalMs.value) {
    onSeek(props.errorOffset);
  }

  ticker = setInterval(() => {
    if (!playing.value) return;
    const cur = computeCurrent();
    currentMs.value = Math.min(cur, totalMs.value);
    sliderValue.value = Math.min(Math.round(cur), totalMs.value);
    if (cur >= totalMs.value) {
      playing.value = false;
      offsetBase = totalMs.value;
      replayer.pause();
    }
  }, 100);
}

function destroyPlayer() {
  if (ticker) { clearInterval(ticker); ticker = null; }
  if (replayer) {
    try { replayer.pause(); } catch { /* 忽略销毁过程中的异常 */ }
    replayer = null;
  }
  if (playerRoot.value) playerRoot.value.innerHTML = '';
  playing.value = false;
}

onMounted(initPlayer);
onBeforeUnmount(destroyPlayer);

watch(() => props.events, (val, old) => {
  if (val !== old) {
    destroyPlayer();
    totalMs.value = 0;
    currentMs.value = 0;
    sliderValue.value = 0;
    requestAnimationFrame(initPlayer);
  }
});
</script>

<style scoped>
.replay-player {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
}

.player-root {
  width: 100%;
  min-height: 420px;
  background: #f5f7fa;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  justify-content: center;
}

.controls {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 14px;
}

.time-text {
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  color: #606266;
  white-space: nowrap;
}

.progress { flex: 1; margin: 0 4px; }
</style>
