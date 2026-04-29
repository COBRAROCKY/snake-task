/**
 * Main experiment script for Snake Cognitive Task
 * Built with jsPsych 7
 */

// Global variable to store subject ID
let subject_id = '';

// 游戏模式：'experiment' 或 'practice'
let gameMode = 'experiment';

// 练习模式最大试次数
const PRACTICE_MAX_TRIALS = 12;

// 全局变量：跨试次保存蛇的状态和分数
// 挂载到 window 上，让插件可以访问
window.globalSnakeState = {
  position: null,        // 蛇的位置数组
  direction: 'RIGHT',    // 蛇的方向
  totalScore: 0          // 累计分数
};
const globalSnakeState = window.globalSnakeState; // 保持本地引用

// Initialize jsPsych
const jsPsych = initJsPsych({
  on_finish: function() {
    // 练习模式不保存数据
    if (gameMode === 'practice') {
      displayPracticeEndMessage();
      return;
    }
    
    // 与Python版本一致的字段列表（按Python CSV顺序）
    const pythonFields = [
      'trial_onset', 'food_presentation_end', 'food_number', 'change_display',
      'all_locs_xy', 'bush_locs_xy', 'key_presses_time', 'key_presses_direction', 'key_presses_key',
      'reminder_onset', 'reminder_offset', 'calibration_onset', 'calibration_offset',
      'time_to_find_food', 'time_to_find_food_corrected', 'food_order',
      'initial_optimal_order', 'updated_optimal_order',
      'time_to_nontarget', 'nontarget_order', 'time_to_dist', 'dist_order',
      'eaten_type', 'eaten_position', 'eaten_time',
      'food_locations', 'food_locs_xy', 'apple_locs_xy', 'banana_locs_xy',
      'apple_quadrant', 'banana_quadrant',
      'special_food', 'special_food_onset', 'special_food_offset', 'special_food_T',
      'special_food_loc', 'special_food_locs_xy',
      'direction_changes_before_food', 'direction_changes_before_food_corrected',
      'reminder_presses_before_food', 'nontarget_before_food',
      'end_score', 'subject_id', 'attempt_number',
      'snake_pos', 'gaze_pos', 'time', 'frozen_snake', 'frozen_time', 'gaze_pos_all'
    ];
    
    // 获取所有snake-task试次的数据（只保留成功完成的试次，以确保数据质量）
    const snakeTrials = jsPsych.data.get()
      .filter({trial_type: 'snake-task'})
      .filter(function(trial) {
        // 过滤掉过短的试次或未正常完成的试次
        return trial.termination_reason === 'completed' && 
               Array.isArray(trial.snake_pos) && 
               trial.snake_pos.length > 10;
      })
      .values();
    
    // 生成CSV（确保字段顺序与Python版本一致）
    let csvContent = pythonFields.join(',') + '\n';
    
    // Python格式化函数（匹配Python的str()表示法）
    function formatPythonValue(value) {
      // 尝试解析已经是JSON字符串的值
      if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
        try {
          value = JSON.parse(value);
        } catch (e) {
          // 忽略解析错误，保持原样
        }
      }

      // null/undefined
      if (value === null || value === undefined) {
        return '';
      }
      
      // 数组：转换为Python格式
      if (Array.isArray(value)) {
        if (value.length === 0) {
          return '[]';
        }
        
        // 检查是否是 eaten_sequence 格式 [{type, position, time}, ...]
        // 必须先检查这个，因为它也包含数组类型的 position
        const isEatenSequence = value.length > 0 &&
          typeof value[0] === 'object' && value[0] !== null && 
          'type' in value[0] && 'time' in value[0];
        
        if (isEatenSequence) {
          // eaten_sequence 格式：转换为 Python 字典列表格式
          const items = value.map(item => {
            let pos;
            if (Array.isArray(item.position)) {
              pos = `(${item.position[0]}, ${item.position[1]})`;
            } else if (item.position && typeof item.position === 'object') {
              pos = `(${item.position.x}, ${item.position.y})`;
            } else {
              pos = String(item.position);
            }
            return `{'type': '${item.type}', 'position': ${pos}, 'time': ${item.time}}`;
          });
          return '[' + items.join(', ') + ']';
        }
        
        // 检查是否是坐标数组 [[x,y], [x,y], ...] 或 [{x,y}, {x,y}, ...]
        const isCoordinateArray = value.length > 0 && 
          ((Array.isArray(value[0]) && value[0].length === 2) ||
           (typeof value[0] === 'object' && value[0] !== null && 'x' in value[0] && 'y' in value[0]));
        
        if (isCoordinateArray) {
          // 坐标数组：转换为 [(x, y), (x, y), ...] 格式
          const coords = value.map(coord => {
            if (Array.isArray(coord)) {
              return `(${coord[0]}, ${coord[1]})`;
            } else {
              return `(${coord.x}, ${coord.y})`;
            }
          });
          return '[' + coords.join(', ') + ']';
        }
        
        // 普通数组
        const items = value.map(item => {
          if (typeof item === 'string') {
            // 字符串用单引号（Python风格）
            return "'" + item.replace(/'/g, "\\'") + "'";
          } else if (typeof item === 'number') {
            return item;
          } else if (item === null) {
            return 'null';
          } else if (typeof item === 'object') {
            // 其他对象类型，使用 JSON 格式
            return JSON.stringify(item);
          } else {
            return String(item);
          }
        });
        return '[' + items.join(', ') + ']';
      }
      
      // 对象：转换为 (x, y) 元组格式
      if (typeof value === 'object' && value !== null) {
        if ('x' in value && 'y' in value) {
          return `(${value.x}, ${value.y})`;
        }
        // 其他对象用JSON
        return JSON.stringify(value);
      }
      
      // 普通值
      return String(value);
    }
    
    snakeTrials.forEach(trial => {
      const row = pythonFields.map(field => {
        let value = formatPythonValue(trial[field]);
        
        // CSV转义：如果包含逗号、引号或换行，需要用引号包裹
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          value = '"' + value.replace(/"/g, '""') + '"';
        }
        
        return value;
      });
      csvContent += row.join(',') + '\n';
    });
    
    // 保存为CSV
    const filename = `snake_${subject_id}_${Date.now()}.csv`;
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    
    // Show completion message
    displayCompletionMessage();
  }
});

// Function to display practice mode end message
function displayPracticeEndMessage() {
  const practiceEndHtml = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; background-color: #2c2c2c; color: white; font-family: Arial, sans-serif;">
      <h1 style="font-size: 48px; margin-bottom: 30px;">练习结束</h1>
      <p style="font-size: 24px; margin-bottom: 20px;">练习模式已完成！</p>
      <p style="font-size: 20px; margin-bottom: 30px; color: #888;">练习模式不保存数据</p>
      <div style="background-color: #444; padding: 30px; border-radius: 10px; max-width: 600px;">
        <p style="font-size: 18px; line-height: 1.6;">
          如果您已经熟悉游戏操作，可以刷新页面开始正式实验。
        </p>
      </div>
      <button onclick="location.reload()" style="margin-top: 30px; padding: 15px 40px; font-size: 20px; background-color: #4BB3FD; color: white; border: none; border-radius: 8px; cursor: pointer;">
        返回主页
      </button>
    </div>
  `;
  
  document.body.innerHTML = practiceEndHtml;
}

// Function to display completion message with download instructions
function displayCompletionMessage() {
  const completionHtml = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; background-color: #2c2c2c; color: white; font-family: Arial, sans-serif;">
      <h1 style="font-size: 48px; margin-bottom: 30px;">实验结束</h1>
      <p style="font-size: 24px; margin-bottom: 20px;">感谢您的参与！</p>
      <p style="font-size: 20px; margin-bottom: 30px;">您的数据已自动下载。</p>
      <div style="background-color: #444; padding: 30px; border-radius: 10px; max-width: 600px;">
        <h3 style="margin-bottom: 15px;">实验总结：</h3>
        <p style="font-size: 18px; line-height: 1.6;">
          总试次数: <strong id="total-trials">-</strong><br>
          平均得分: <strong id="avg-score">-</strong><br>
          总反应时间: <strong id="total-rt">-</strong> ms
        </p>
      </div>
    </div>
  `;
  
  document.body.innerHTML = completionHtml;
  
  // Calculate and display summary statistics
  const trials = jsPsych.data.get().filter({trial_type: 'snake-task'});
  const totalTrials = trials.count();
  const scores = trials.select('end_score').values;
  const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : '0';
  const rts = trials.select('rt').values;
  const totalRT = rts.length > 0 ? (rts.reduce((a, b) => a + b, 0) / 1000).toFixed(0) : '0'; // Total time in seconds
  
  document.getElementById('total-trials').textContent = totalTrials;
  document.getElementById('avg-score').textContent = avgScore;
  document.getElementById('total-rt').textContent = totalRT;
  
  // Display ranking info
  const rankingInfo = document.createElement('p');
  rankingInfo.style.cssText = 'font-size: 16px; margin-top: 20px; color: #888;';
  rankingInfo.innerHTML = `历史记录中共有 <strong>${jsPsychSnakeTask.getHistoricalScores ? jsPsychSnakeTask.getHistoricalScores().length : 'N/A'}</strong> 次得分记录`;
  document.querySelector('div[style*="background-color: #444"]').appendChild(rankingInfo);
}

// Mode selection screen - 美化版本，类似图2设计
const mode_selection = {
  type: jsPsychHtmlButtonResponse,
  stimulus: `
    <div style="max-width: 900px; margin: 0 auto; text-align: center; padding: 50px 40px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
      <h1 style="color: #333; margin-bottom: 20px; font-size: 36px; font-weight: bold;">欢迎参加贪吃蛇认知实验</h1>
      <p style="font-size: 20px; color: #666; margin-bottom: 50px;">请选择游戏模式：</p>
      
      <div style="display: flex; justify-content: center; gap: 40px; margin-bottom: 50px;">
        <!-- 练习模式卡片 -->
        <div id="practice-card" style="width: 280px; padding: 30px 25px; background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%); border-radius: 16px; cursor: pointer; transition: all 0.3s ease; border: 3px solid transparent;" 
             onmouseover="this.style.transform='translateY(-5px)'; this.style.boxShadow='0 8px 25px rgba(33,150,243,0.3)';" 
             onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
          <div style="font-size: 40px; margin-bottom: 15px;">🎮</div>
          <h2 style="color: #1976d2; font-size: 26px; margin-bottom: 20px; font-weight: bold;">练习模式</h2>
          <p style="color: #555; font-size: 15px; line-height: 1.8; text-align: center;">
            熟悉游戏操作<br>
            最多练习 <strong>12</strong> 次<br>
            按Q结束后<strong>不保存数据</strong>
          </p>
        </div>
        
        <!-- 实验模式卡片 -->
        <div id="experiment-card" style="width: 280px; padding: 30px 25px; background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%); border-radius: 16px; cursor: pointer; transition: all 0.3s ease; border: 3px solid transparent;"
             onmouseover="this.style.transform='translateY(-5px)'; this.style.boxShadow='0 8px 25px rgba(76,175,80,0.3)';" 
             onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
          <div style="font-size: 40px; margin-bottom: 15px;">📊</div>
          <h2 style="color: #388e3c; font-size: 26px; margin-bottom: 20px; font-weight: bold;">实验模式</h2>
          <p style="color: #555; font-size: 15px; line-height: 1.8; text-align: center;">
            正式实验<br>
            按Q结束后<strong>保存数据</strong><br>
            数据将用于研究分析
          </p>
        </div>
      </div>
    </div>
  `,
  choices: ['练习模式', '实验模式'],
  button_html: [
    '<button class="jspsych-btn" style="font-size: 18px; padding: 15px 35px; margin: 0 15px; min-width: 140px; border-radius: 8px; border: none; cursor: pointer; background: linear-gradient(135deg, #42a5f5 0%, #1976d2 100%); color: white; box-shadow: 0 4px 15px rgba(33,150,243,0.4);">练习模式</button>',
    '<button class="jspsych-btn" style="font-size: 18px; padding: 15px 35px; margin: 0 15px; min-width: 140px; border-radius: 8px; border: none; cursor: pointer; background: linear-gradient(135deg, #66bb6a 0%, #388e3c 100%); color: white; box-shadow: 0 4px 15px rgba(76,175,80,0.4);">实验模式</button>'
  ],
  on_finish: function(data) {
    if (data.response === 0) {
      gameMode = 'practice';
    } else {
      gameMode = 'experiment';
    }
  }
};

// Welcome screen
const welcome = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: `
    <div style="max-width: 800px; margin: 0 auto; text-align: center; padding: 40px; background-color: #f5f5f5; border-radius: 10px;">
      <h1 style="color: #333; margin-bottom: 30px;">欢迎参加贪吃蛇认知实验</h1>
      <div style="text-align: left; font-size: 18px; line-height: 1.8; color: #555;">
        <p><strong>实验说明：</strong></p>
        <ul style="margin-left: 20px;">
          <li>每个试次开始时，您会看到蛇和目标食物（红色圆点）</li>
          <li>记住食物的位置（显示 2 秒）</li>
          <li>食物会消失，屏幕进入"冻结"状态（2 秒）</li>
          <li>之后您可以使用<strong>方向键</strong>控制蛇移动</li>
          <li>吃到目标食物：<span style="color: green;"><strong>+1 分</strong></span></li>
          <li>吃到错误位置：<span style="color: red;"><strong>-1 分</strong></span></li>
          <li>吃到特殊食物（金色）：<span style="color: gold;"><strong>+3 分</strong></span></li>
          <li>撞墙或撞到自己：游戏结束</li>
          <li>按 <strong>F 键</strong>可以再次显示食物位置（扣1分）</li>
          <li>按 <strong>空格键</strong>可以暂停游戏</li>
          <li>按 <strong>Q 键</strong>可以退出当前试次</li>
          <li>吃到错误位置会<span style="color: red;">冻结2秒</span></li>
        </ul>
        <p style="margin-top: 30px; font-size: 22px; color: #4BB3FD; animation: blink 1.5s infinite;"><strong>👆 按任意键继续...</strong></p>
      </div>
    </div>
    <style>
      @keyframes blink {
        0%, 50%, 100% { opacity: 1; }
        25%, 75% { opacity: 0.5; }
      }
    </style>
  `,
  choices: 'ALL_KEYS',
  trial_duration: null,
  post_trial_gap: 500
};

// Subject ID input
const subject_id_trial = {
  type: jsPsychSurveyText,
  questions: [
    {
      prompt: '请输入您的被试编号：',
      name: 'subject_id',
      required: true,
      placeholder: '例如：001'
    }
  ],
  button_label: '开始实验',
  on_finish: function(data) {
    // Store subject ID globally
    subject_id = data.response.subject_id;
    // Add subject ID to all subsequent trials
    jsPsych.data.addProperties({
      subject_id: subject_id,
      experiment_name: 'snake_cognitive_task',
      experiment_version: '1.0.0'
    });
  }
};

// Instructions screen
const instructions = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: `
    <div style="max-width: 800px; margin: 0 auto; text-align: center; padding: 40px; background-color: #f5f5f5; border-radius: 10px;">
      <h2 style="color: #333; margin-bottom: 30px;">详细说明</h2>
      <div style="text-align: left; font-size: 18px; line-height: 1.8; color: #555;">
        <p><strong>实验流程：</strong></p>
        <ol style="margin-left: 20px;">
          <li><strong>食物呈现阶段（2秒）</strong>
            <ul style="margin-left: 20px; margin-top: 10px;">
              <li>您会看到 1-2 个红色目标食物</li>
              <li>请记住它们的位置</li>
              <li>蛇的初始位置在屏幕中央</li>
            </ul>
          </li>
          <li style="margin-top: 15px;"><strong>冻结阶段（2秒）</strong>
            <ul style="margin-left: 20px; margin-top: 10px;">
              <li>食物会消失</li>
              <li>蛇的位置会用一个蓝色缩小的圆圈标记</li>
              <li>在此阶段无法移动</li>
            </ul>
          </li>
          <li style="margin-top: 15px;"><strong>移动阶段</strong>
            <ul style="margin-left: 20px; margin-top: 10px;">
              <li>使用方向键（↑↓←→）控制蛇移动</li>
              <li>找到并吃掉所有目标食物</li>
              <li>注意：有50%的概率会出现金色特殊食物（+3分）</li>
              <li>每个试次最长 60 秒</li>
              <li><strong>忘记食物位置？</strong>按 <span style="color: orange;">F 键</span> 重新显示（-1分）</li>
              <li>吃到错误位置会<span style="color: red;">冻结2秒</span>并扣1分</li>
            </ul>
          </li>
        </ol>
        <p style="margin-top: 30px; font-size: 20px; color: #d9534f;">
          <strong>重要提示：</strong><br>
          请尽可能快速且准确地完成任务！
        </p>
        <p style="margin-top: 30px; font-size: 22px; color: #4BB3FD; animation: blink 1.5s infinite;"><strong>👆 按任意键开始正式实验</strong></p>
      </div>
    </div>
    <style>
      @keyframes blink {
        0%, 50%, 100% { opacity: 1; }
        25%, 75% { opacity: 0.5; }
      }
    </style>
  `,
  choices: 'ALL_KEYS',
  trial_duration: null,
  post_trial_gap: 500
};

// Practice trial
const practice_trial = {
  type: jsPsychSnakeTask,
  trial_duration: 30000, // 30 seconds for practice
  show_food_duration: 3000, // Longer for practice
  freeze_duration: 2000,
  num_foods: null, // 2 or 4 apples for practice
  data: {
    trial_type: 'practice'
  }
};

// Practice feedback - 已移除，参考 template.py 直接进入下一轮
// const practice_feedback = { ... };

// Create experimental trials loop structure
const GOAL_SCORE = 1500;
const MAX_TIME_MINUTES = 60;
const MAX_TIME_MS = MAX_TIME_MINUTES * 60 * 1000;
let experimentStartTime = null;

// Helper function to get previous trial data - 使用全局变量
function getPreviousSnakeData() {
  console.log('[DEBUG] Getting global snake state:', window.globalSnakeState);
  return {
    position: window.globalSnakeState.position,
    direction: window.globalSnakeState.direction,
    score: window.globalSnakeState.totalScore
  };
}

// 更新全局状态的函数 - 在每个试次结束后调用
function updateGlobalSnakeState(trialData) {
  if (trialData.final_snake_position) {
    window.globalSnakeState.position = JSON.parse(trialData.final_snake_position);
  }
  if (trialData.final_snake_direction) {
    window.globalSnakeState.direction = trialData.final_snake_direction;
  }
  if (trialData.end_score !== undefined) {
    window.globalSnakeState.totalScore = trialData.end_score;
  }
  console.log('[DEBUG] Updated global snake state:', window.globalSnakeState);
}

// Single trial definition
const snake_trial = {
  type: jsPsychSnakeTask,
  // Calculate remaining time for this trial
  trial_duration: function() {
    if (!experimentStartTime) return MAX_TIME_MS;
    const elapsed = Date.now() - experimentStartTime;
    const remaining = MAX_TIME_MS - elapsed;
    return remaining > 0 ? remaining : 0; // If time is up, 0 duration ends it immediately
  },
  show_food_duration: 2000,
  freeze_duration: 2000,
  num_foods: null, // Random 2 or 4
  grape_time_limit: 10000, // 10 seconds for grape collection
  
  // Dynamic parameters from previous trial
  initial_snake_position: function() {
    return getPreviousSnakeData().position;
  },
  initial_snake_direction: function() {
    return getPreviousSnakeData().direction;
  },
  current_total_score: function() {
    return getPreviousSnakeData().score;
  },
  
  data: {
    trial_type: 'experimental'
  },
  
  on_load: function() {
    // Set start time on first load
    if (!experimentStartTime) {
      experimentStartTime = Date.now();
      console.log('[MAIN] Experiment started at:', experimentStartTime);
    }
  },
  
  on_finish: function(data) {
    // Global state is already updated inside the plugin before finishTrial
    // to handle "crash" logic correctly (resetting position).
    // No need to update it here again, as it would overwrite the reset with the crash position.
    
    // Add trial number for data analysis
    // 注意：trial_type 是插件名 'snake-task'，不是 'experimental'
    const trialCount = jsPsych.data.get().filter({trial_type: 'snake-task'}).count();
    data.trial_number = trialCount;
  }
};

// Loop node logic
const game_loop = {
  timeline: [snake_trial],
  loop_function: function(data) {
    // 0. 练习模式：检查试次数限制
    if (gameMode === 'practice') {
      const practiceTrials = jsPsych.data.get().filter({trial_type: 'snake-task'}).count();
      if (practiceTrials >= PRACTICE_MAX_TRIALS) {
        console.log('[MAIN] Practice mode: Max trials reached (' + PRACTICE_MAX_TRIALS + '). Ending loop.');
        return false;
      }
    }
    
    // 1. Check Time Limit (仅实验模式)
    if (gameMode === 'experiment' && experimentStartTime && (Date.now() - experimentStartTime >= MAX_TIME_MS)) {
      console.log('[MAIN] Max time reached. Ending loop.');
      return false;
    }
    
    // 2. Check Score Limit and Quit Condition from last trial data
    const lastTrial = data.values()[data.values().length - 1];
    
    // Check explicit quit (Q key) or goal reached
    // Plugin returns 'manual_quit' when Q is pressed
    if (lastTrial.termination_reason === 'quit' || lastTrial.termination_reason === 'manual_quit' || lastTrial.termination_reason === 'goal_reached') {
      console.log('[MAIN] Termination reason:', lastTrial.termination_reason, '. Ending loop.');
      return false;
    }
    
    // Check Score Limit (Double check global state) - 仅实验模式
    if (gameMode === 'experiment' && window.globalSnakeState.totalScore >= GOAL_SCORE) {
      console.log('[MAIN] Goal score reached (global check). Ending loop.');
      return false;
    }

    console.log('[MAIN] Continuing loop. Score:', window.globalSnakeState.totalScore);
    return true; // Continue playing
  }
};

// Final thank you message before data download
const thank_you = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: `
    <div style="max-width: 600px; margin: 0 auto; text-align: center; padding: 40px; background-color: #f5f5f5; border-radius: 10px;">
      <h1 style="color: #333; margin-bottom: 30px;">实验完成！</h1>
      <p style="font-size: 20px; color: #555; line-height: 1.8;">
        感谢您的参与！<br>
        您的数据正在准备下载...<br>
        <br>
        <span style="font-size: 22px; color: #4BB3FD; animation: blink 1.5s infinite;"><strong>👆 按任意键下载数据并查看总结</strong></span>
      </p>
    </div>
    <style>
      @keyframes blink {
        0%, 50%, 100% { opacity: 1; }
        25%, 75% { opacity: 0.5; }
      }
    </style>
  `,
  choices: 'ALL_KEYS',
  trial_duration: null
};

// Build timeline
const timeline = [];

// Add all trial components
timeline.push(mode_selection);  // 首先选择模式
timeline.push(welcome);
timeline.push(subject_id_trial);
timeline.push(instructions);
timeline.push(practice_trial);
// practice_feedback 已移除，参考 template.py 直接进入下一轮
// Replace fixed loop with game loop
timeline.push(game_loop);
timeline.push(thank_you);

// Run the experiment
jsPsych.run(timeline);
