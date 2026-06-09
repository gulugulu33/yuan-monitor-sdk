/**
 * EventBus 单元测试
 */
import EventBus from '../src/core/eventBus';

// 每个测试前重置 EventBus
describe('EventBus', () => {
  beforeEach(() => {
    EventBus.clear();
  });

  test('on/emit 基本功能', () => {
    const callback = jest.fn();
    EventBus.on('test', callback);
    EventBus.emit('test', 'arg1', 'arg2');
    expect(callback).toHaveBeenCalledWith('arg1', 'arg2');
  });

  test('emit 支持回调返回值（单个监听器）', () => {
    EventBus.on('getData', () => 'hello');
    const result = EventBus.emit('getData');
    expect(result).toBe('hello');
  });

  test('emit 支持回调返回值（多个监听器）', () => {
    EventBus.on('getData', () => 'a');
    EventBus.on('getData', () => 'b');
    const result = EventBus.emit('getData');
    expect(result).toEqual(['a', 'b']);
  });

  test('emit 无监听器时返回 undefined', () => {
    const result = EventBus.emit('nonexistent');
    expect(result).toBeUndefined();
  });

  test('emit 回调出错不中断其他回调', () => {
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const callback1 = jest.fn(() => { throw new Error('test'); });
    const callback2 = jest.fn(() => 'ok');

    EventBus.on('test', callback1);
    EventBus.on('test', callback2);
    const result = EventBus.emit('test');

    expect(callback1).toHaveBeenCalled();
    expect(callback2).toHaveBeenCalled();
    expect(result).toEqual(['ok']);
    consoleWarn.mockRestore();
  });

  test('off 取消订阅', () => {
    const callback = jest.fn();
    EventBus.on('test', callback);
    EventBus.off('test', callback);
    EventBus.emit('test');
    expect(callback).not.toHaveBeenCalled();
  });

  test('off 不传 callback 时删除整个事件', () => {
    const callback1 = jest.fn();
    const callback2 = jest.fn();
    EventBus.on('test', callback1);
    EventBus.on('test', callback2);
    EventBus.off('test');
    EventBus.emit('test');
    expect(callback1).not.toHaveBeenCalled();
    expect(callback2).not.toHaveBeenCalled();
  });

  test('once 只触发一次', () => {
    const callback = jest.fn();
    EventBus.once('test', callback);
    EventBus.emit('test', 'first');
    EventBus.emit('test', 'second');
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('first');
  });

  test('clear 清空所有事件', () => {
    const callback = jest.fn();
    EventBus.on('test1', callback);
    EventBus.on('test2', callback);
    EventBus.clear();
    EventBus.emit('test1');
    EventBus.emit('test2');
    expect(callback).not.toHaveBeenCalled();
  });
});
