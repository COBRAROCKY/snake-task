# 贪吃蛇游戏 - 视觉参数配置指南

本文档列出了游戏中所有可调整的视觉参数，包括文件路径、行号和修改方法。

## 快速参考表

| 调整目标 | 文件路径 | 行号 | 当前值 | 说明 |
|----------|----------|------|--------|------|
| **草丛间隙** | `plugins/jspsych-snake-task-v2.js` | 457 | `GRID_SIZE * 2.0` | 乘数越大间隙越大，推荐 4.0-6.0 |
| **蛇移动速度** | `plugins/jspsych-snake-task-v2.js` | 130 | `6` | 帧/秒，值越大移动越快 |
| **每象限草丛数量** | `plugins/jspsych-snake-task-v2.js` | 133 | `5` | 总草丛数 = 此值 × 4 |
| **草丛距边缘距离** | `plugins/jspsych-snake-task-v2.js` | 469 | `GRID_SIZE * 3` | 乘数越大离边缘越远 |
| **中心排除区域** | `plugins/jspsych-snake-task-v2.js` | 470 | `GRID_SIZE * 4` | 蛇起始位置周围的空白区域 |
| **画布宽度** | `plugins/jspsych-snake-task-v2.js` | 50-54 | `1920` | 像素 |
| **画布高度** | `plugins/jspsych-snake-task-v2.js` | 56-60 | `1080` | 像素 |
| **网格大小** | `plugins/jspsych-snake-task-v2.js` | 38-42 | `40` | 影响蛇移动步长 |
| **蛇头大小** | `plugins/jspsych-snake-task-v2.js` | 99-103 | `2.5` | 相对于 grid_size 的倍率 |
| **蛇身大小** | `plugins/jspsych-snake-task-v2.js` | 93-97 | `1.0` | 相对于 grid_size 的倍率 |
| **草丛大小** | `plugins/jspsych-snake-task-v2.js` | 105-109 | `2.0` | 相对于 grid_size 的倍率 |
| **苹果/葡萄/苹果核大小** | `plugins/jspsych-snake-task-v2.js` | 111-115 | `2.0` | 相对于 grid_size 的倍率 |

---

## 详细说明

### 1. 草丛间隙（minSpacing）

- **文件：** `plugins/jspsych-snake-task-v2.js`
- **行号：** 第 457 行

```javascript
const minSpacing = this.GRID_SIZE * 2.0; // 当前值
const minSpacing = this.GRID_SIZE * 5.0; // 更分散的草丛
```

### 2. 蛇移动速度（SPEED）

- **文件：** `plugins/jspsych-snake-task-v2.js`
- **行号：** 第 130 行

```javascript
this.SPEED = 6;  // 当前值（帧/秒）
this.SPEED = 10; // 更快
this.SPEED = 4;  // 更慢
```

### 3. 蛇头大小（head_size）

- **文件：** `plugins/jspsych-snake-task-v2.js`
- **行号：** 第 102 行

```javascript
default: 2.5,  // 当前值
default: 3.5,  // 更大的蛇头
```

### 4. 蛇身大小（body_size）

- **文件：** `plugins/jspsych-snake-task-v2.js`
- **行号：** 第 96 行

```javascript
default: 1.0,  // 当前值
default: 0.6,  // 更细的蛇身
```

### 5. 草丛大小（bush_size）

- **文件：** `plugins/jspsych-snake-task-v2.js`
- **行号：** 第 108 行

```javascript
default: 2.0,  // 当前值
default: 1.5,  // 更小的草丛
```

### 6. 苹果大小（apple_size）

- **文件：** `plugins/jspsych-snake-task-v2.js`
- **行号：** 第 114 行

```javascript
default: 2.0,  // 当前值（也用于葡萄和苹果核）
default: 2.5,  // 更大的苹果
```

### 7. 画布大小

- **文件：** `plugins/jspsych-snake-task-v2.js`
- **行号：** 第 53 行（宽度）、第 59 行（高度）

```javascript
// 第 53 行 - 画布宽度
default: 1920,

// 第 59 行 - 画布高度
default: 1080,
```

### 8. 网格大小（grid_size）

- **文件：** `plugins/jspsych-snake-task-v2.js`
- **行号：** 第 41 行

```javascript
default: 40,  // 当前值（像素）
default: 50,  // 更大的网格（蛇移动步长更大）
```

### 9. 每象限草丛数量（NUM_BUSHES_PER_QUADRANT）

- **文件：** `plugins/jspsych-snake-task-v2.js`
- **行号：** 第 133 行

```javascript
this.NUM_BUSHES_PER_QUADRANT = 5;  // 当前值，总共 20 个草丛
this.NUM_BUSHES_PER_QUADRANT = 7;  // 更多草丛，总共 28 个
```

### 10. 草丛距边缘距离（margin）

- **文件：** `plugins/jspsych-snake-task-v2.js`
- **行号：** 第 469 行

```javascript
const margin = this.GRID_SIZE * 3;  // 当前值
const margin = this.GRID_SIZE * 5;  // 草丛离边缘更远
```

### 11. 中心排除区域（centerExclusion）

- **文件：** `plugins/jspsych-snake-task-v2.js`
- **行号：** 第 470 行

```javascript
const centerExclusion = this.GRID_SIZE * 4;  // 当前值
const centerExclusion = this.GRID_SIZE * 6;  // 中心空白区域更大
```

---

## 参数效果对照表

| 想要的效果 | 修改参数 | 修改方向 |
|------------|----------|----------|
| 草丛更分散 | 第 457 行 `minSpacing` | 增大乘数 (2.0 → 5.0) |
| 草丛更密集 | 第 457 行 `minSpacing` | 减小乘数 (2.0 → 1.5) |
| 蛇移动更快 | 第 130 行 `SPEED` | 增大数值 (6 → 10) |
| 蛇移动更慢 | 第 130 行 `SPEED` | 减小数值 (6 → 4) |
| 蛇头更大 | 第 102 行 `head_size` | 增大数值 (2.5 → 3.5) |
| 蛇身更细 | 第 96 行 `body_size` | 减小数值 (1.0 → 0.6) |
| 草丛更小 | 第 108 行 `bush_size` | 减小数值 (2.0 → 1.5) |
| 苹果更大 | 第 114 行 `apple_size` | 增大数值 (2.0 → 2.5) |
| 更多草丛 | 第 133 行 `NUM_BUSHES_PER_QUADRANT` | 增大数值 (5 → 7) |
| 草丛离边缘更远 | 第 469 行 `margin` | 增大乘数 (3 → 5) |
| 中心空白更大 | 第 470 行 `centerExclusion` | 增大乘数 (4 → 6) |
| 画布更大 | 第 53、59 行 | 增大像素值 |
| 网格更大 | 第 41 行 `grid_size` | 增大像素值 (40 → 50) |
