import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts';

/**
 * ECharts 组合式封装：自动初始化、随数据更新、窗口自适应、销毁清理
 */
export function useChart(getOption) {
  const chartRef = ref(null);
  let chart = null;

  const render = () => {
    if (!chartRef.value) return;
    if (!chart) chart = echarts.init(chartRef.value);
    chart.setOption(getOption(), true);
  };

  const resize = () => chart && chart.resize();

  onMounted(() => {
    render();
    window.addEventListener('resize', resize);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('resize', resize);
    if (chart) {
      chart.dispose();
      chart = null;
    }
  });

  watch(() => getOption(), render, { deep: true });

  return { chartRef, render };
}
