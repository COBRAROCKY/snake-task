# 贪吃蛇认知实验 - Web/jsPsych 版本

## 项目简介

这是一个基于 jsPsych 7 的贪吃蛇认知实验任务的在线版本，从原始的 Python pygame 实现移植而来。实验用于研究工作记忆、空间导航和决策制定等认知功能。

## 实验逻辑总结

### Python 原版实验结构

#### Trial 流程
1. **食物呈现阶段 (2000ms)**
   - 显示蛇的初始位置（屏幕中央）
   - 显示 1-2 个目标食物（红色圆点/苹果图标）
   - 显示所有可能的食物位置（灌木丛）
   - 被试需要记住目标食物的位置

2. **冻结阶段 (2000ms)**
   - 隐藏食物
   - 在蛇头位置显示一个标记（圆形/十字）
   - 禁止移动
   - 测试被试的工作记忆

3. **移动阶段**
   - 使用方向键控制蛇移动
   - 吃到目标食物：+1 分
   - 吃到错误位置：-1 分，蛇冻结 2 秒并闪烁
   - 可能出现特殊食物（干扰物，50% 概率）：+3 分
   - 撞墙或撞到自己：游戏结束
   - 所有目标食物吃完：trial 结束

#### 食物生成规则
- 食物位置基于 5×7 网格
- 位置经过抖动处理，避免过于规则
- 目标食物数量：1-2 个（随机）
- 特殊食物（干扰物）：50% 概率出现，位置随机
- 食物不会出现在蛇身上或蛇的预测路径上

#### 数据记录
- `trial_onset`: Trial 开始时间
- `food_number`: 目标食物数量
- `food_locations`: 食物位置编号
- `food_locs_xy`: 食物坐标
- `key_presses_time`: 按键时间
- `key_presses_direction`: 按键方向
- `snake_pos`: 蛇头位置（每帧）
- `time`: 时间戳
- `score`: 当前得分
- `time_to_find_food`: 找到每个食物的时间
- `direction_changes_before_food`: 找到食物前的方向改变次数
- `special_food_*`: 特殊食物相关数据
- `gaze_pos`: 眼动数据（如果启用）

#### 忽略的功能（Web 版本不实现）
- EEG 标记发送
- 眼动追踪集成
- 手柄支持
- 复杂的象限规则和最优路径计算
- 蛇的生长机制
- 累计分数和排名系统

## Web 版本简化设计

### 保留的核心功能
- ✅ 三阶段 trial 流程（呈现 → 冻结 → 移动）
- ✅ 基本加减分规则
- ✅ 键盘方向键控制
- ✅ 特殊食物机制
- ✅ 碰撞检测（墙、自身）
- ✅ 核心行为数据记录
- ✅ CSV 数据导出

### 技术栈
- **jsPsych 7.3.4**: 实验框架
- **HTML5 Canvas**: 游戏渲染
- **JavaScript ES6+**: 核心逻辑
- **纯 CSS**: 样式设计

### 文件结构
```
snake_jspsych/
├── index.html                           # 主入口文件
├── main.js                              # 实验流程控制
├── plugins/
│   └── jspsych-snake-task.js           # 自定义插件
└── README.md                            # 说明文档
```

## 使用方法

### 1. 本地运行

由于浏览器安全限制，不能直接打开 `index.html` 文件。需要启动本地服务器：

#### 方法 A: 使用 Python（推荐）
```bash
# Python 3
cd snake_jspsych
python -m http.server 5678

# 然后在浏览器访问
# http://localhost:5678
```

#### 方法 B: 使用 Node.js
```bash
# 安装 http-server
npm install -g http-server

# 运行
cd snake_jspsych
http-server -p 8000

# 访问 http://localhost:8000
```

#### 方法 C: 使用 VS Code
1. 安装 "Live Server" 扩展
2. 右键点击 `index.html`
3. 选择 "Open with Live Server"

### 2. 在线部署

可以部署到以下平台：
- **Netlify**: 拖拽整个文件夹即可
- **GitHub Pages**: 上传到 GitHub 仓库并启用 Pages
- **Vercel**: 导入项目并部署

### 3. 嵌入到其他实验平台

可以集成到 Qualtrics、Pavlovia、JATOS 等平台。

## 数据格式

### CSV 输出字段

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `subject_id` | string | 被试编号 |
| `trial_number` | number | Trial 编号 |
| `score` | number | 本 trial 得分 |
| `food_positions` | array | 目标食物位置 `[{x, y}, ...]` |
| `special_food_position` | object/null | 特殊食物位置 `{x, y}` |
| `snake_path` | array | 蛇的路径 `[{x, y, time}, ...]` |
| `key_presses` | array | 按键记录 `[{key, direction, time}, ...]` |
| `phase_transitions` | array | 阶段转换 `[{phase, time}, ...]` |
| `eaten_foods` | array | 吃到的食物 `[{position, time, type}, ...]` |
| `errors` | array | 错误位置 `[{position, time}, ...]` |
| `rt` | number | Trial 总时长 (ms) |
| `game_over` | boolean | 是否游戏结束 |
| `foods_remaining` | number | 剩余食物数量 |

### 使用自动分析脚本

项目已包含 `parse.py` 脚本，可自动分析导出的 CSV 数据：

**步骤 1：保存数据文件**
```bash
# 将下载的 CSV 文件放入 data 文件夹
snake_jspsych/
├── data/
│   ├── snake_001_1732536000000.csv
│   ├── snake_002_1732536100000.csv
│   └── ...
├── parse.py
└── ...
```

**步骤 2：运行分析脚本**
```bash
cd snake_jspsych
python parse.py
```

**输出内容：**
- 控制台显示详细的统计报告
- 生成 `summary_*.csv`：摘要统计文件（包含数据质量指标）
- 生成 `validation_*.txt`：数据质量检查报告（如有问题）
- 生成 `parsed_*.xlsx`：解析后的完整数据（Excel格式）

**分析报告包括：**
- **数据质量检查**（逐 trial 验证数据完整性）
  - ✓ snake_pos 轨迹数量 > 10
  - ✓ time_to_find_food 不为空
  - ✓ food_presentation_end > trial_onset
  - ✓ special_food_onset 在编码结束之后
  - ✓ time_to_dist、dist_order 在干扰试次中有值
  - ✓ nontarget_before_food 全局检查
- 基本信息（被试编号、试次数、实验版本）
- 分数统计（累计分数、平均得分、最高/最低得分）
- 时间统计（总时长、平均每轮时长）
- 结束原因分布（撞墙、完成、超时等）
- 食物任务表现（平均寻找时间、速度）
- 特殊食物统计（葡萄获取率）
- 错误统计（错误位置访问次数）
- 提醒功能使用情况
- 移动行为统计（总步数、平均移动）

### 手动数据分析示例 (Python)

如果需要自定义分析，可以使用以下代码：

```python
import pandas as pd
import json

# 读取 CSV
df = pd.read_csv('data/snake_001_*.csv')

# 解析 JSON 字段（重要！）
def parse_json_field(x):
    try:
        return json.loads(x) if pd.notna(x) else []
    except:
        return []

df['snake_pos'] = df['snake_pos'].apply(parse_json_field)
df['time_to_find_food'] = df['time_to_find_food'].apply(parse_json_field)

# 筛选实验试次
exp_df = df[df['trial_type'] == 'experimental']

# 计算统计指标
avg_score = exp_df['end_score'].iloc[-1]  # 最终累计分数
avg_rt = exp_df['rt'].mean()  # 平均反应时间
total_steps = sum(len(x) for x in exp_df['snake_pos'])  # 总移动步数

print(f"最终分数: {avg_score}")
print(f"平均反应时间: {avg_rt:.0f} ms")
print(f"总移动步数: {total_steps}")
```

## 参数配置

### 可调节的实验参数

在 `main.js` 中可以修改：

```javascript
const experimental_trials = [];

for (let i = 0; i < num_trials; i++) {
  experimental_trials.push({
    type: jsPsychSnakeTask,
    trial_duration: 60000,      // Trial 最长时长
    show_food_duration: 2000,   // 食物呈现时长
    freeze_duration: 2000,      // 冻结时长
    num_foods: null,            // 食物数量 (null=随机)
    // ... 更多参数
  });
}
```

### 插件参数

在 `jspsych-snake-task.js` 中定义的参数：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `trial_duration` | int | 60000 | Trial 最长时长 (ms) |
| `show_food_duration` | int | 2000 | 食物呈现时长 (ms) |
| `freeze_duration` | int | 2000 | 冻结时长 (ms) |
| `grid_size` | int | 40 | 网格大小 (px) |
| `canvas_width` | int | 1000 | 画布宽度 (px) |
| `canvas_height` | int | 700 | 画布高度 (px) |
| `num_foods` | int/null | null | 食物数量 (1-2, null=随机) |

## 自定义与扩展

### 修改颜色主题

在 `jspsych-snake-task.js` 中找到 `COLORS` 对象：

```javascript
this.COLORS = {
  background: '#3c3c3c',      // 背景色
  snake_head: '#4BB3FD',      // 蛇头颜色
  snake_body: '#4BB3FD',      // 蛇身颜色
  food_target: '#FF4444',     // 目标食物颜色
  food_special: '#FFD700',    // 特殊食物颜色
  bush: '#2d5016',            // 灌木颜色
  // ...
};
```

### 添加音效

可以使用 Web Audio API 或 Howler.js 添加音效：

```javascript
// 在 checkCollisions() 中添加
const eatSound = new Audio('sounds/eat.mp3');
eatSound.play();
```

### 添加图片资源

替换简单的形状绘制为图片：

```javascript
// 加载图片
const snakeHeadImg = new Image();
snakeHeadImg.src = 'images/snake_head.png';

// 在 render() 中使用
this.ctx.drawImage(snakeHeadImg, head.x, head.y, this.GRID_SIZE, this.GRID_SIZE);
```

## 已知限制

1. **移动设备支持**: 目前仅支持键盘，不支持触屏操作
2. **浏览器兼容性**: 需要现代浏览器（Chrome, Firefox, Safari, Edge 最新版）
3. **性能**: 在低性能设备上可能帧率不稳定
4. **网格精度**: 简化版的网格生成，与 Python 版本略有不同

## 未来改进方向

- [ ] 添加触屏控制（移动设备）
- [ ] 添加音效和动画效果
- [ ] 实现更复杂的食物生成算法
- [ ] 支持在线数据库存储
- [ ] 添加实时反馈和可视化
- [ ] 多语言支持（英文、中文等）
- [ ] 自适应难度调整

## 技术支持

### 常见问题

**Q: 数据没有自动下载？**
A: 确保浏览器允许下载文件。某些浏览器可能会阻止自动下载。

**Q: 游戏运行很卡？**
A: 尝试关闭其他浏览器标签页，或者降低 `SPEED` 参数。

**Q: 食物位置看起来不太随机？**
A: 这是简化版实现，可以在 `generateLocations()` 中添加抖动算法。

### 联系方式

如有问题或建议，请联系：
- Email: your.email@example.com
- GitHub Issues: https://github.com/your-repo/snake-jspsych

## 许可证

本项目基于 MIT 许可证开源。

## 致谢

- 原始 Python 实验设计
- jsPsych 社区和文档
- 所有参与测试的被试

---

**版本**: 1.0.0  
**最后更新**: 2024-11-23  
**作者**: [Your Name]
