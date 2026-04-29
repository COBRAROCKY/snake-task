/**
 * jsPsych Snake Task Plugin
 * Based on the Python implementation: snake_game_eeg_2targs_random_v2.py
 * 
 * Features:
 * - 3 Phases: Show Food -> Freeze -> Move
 * - Images for Snake, Food, Bushes
 * - Audio feedback
 * - Quadrant-based food placement logic
 * - Distractor (Special Food) mechanism
 * - Pie Chart Score Feedback
 */

var jsPsychSnakeTask = (function (jspsych) {
  'use strict';

  const info = {
    name: 'snake-task',
    parameters: {
      trial_duration: {
        type: jspsych.ParameterType.INT,
        pretty_name: 'Trial duration',
        default: 60000,
        description: 'Maximum duration for this trial in milliseconds'
      },
      show_food_duration: {
        type: jspsych.ParameterType.INT,
        pretty_name: 'Show food duration',
        default: 2000,
        description: 'Duration to show food before freezing (ms)'
      },
      freeze_duration: {
        type: jspsych.ParameterType.INT,
        pretty_name: 'Freeze duration',
        default: 2000,
        description: 'Duration of freeze period (ms)'
      },
      grid_size: {
        type: jspsych.ParameterType.INT,
        pretty_name: 'Grid size',
        default: 40,
        description: 'Size of each grid cell in pixels'
      },
      scale_factor: {
        type: jspsych.ParameterType.INT,
        pretty_name: 'Scale factor',
        default: 1, // Adjust if images need scaling
        description: 'Scale factor for images'
      },
      canvas_width: {
        type: jspsych.ParameterType.INT,
        pretty_name: 'Canvas width',
        default: 1920, // Matched closer to typical web view, original was 1920
        description: 'Width of the canvas'
      },
      canvas_height: {
        type: jspsych.ParameterType.INT,
        pretty_name: 'Canvas height',
        default: 1080, // Matched closer to typical web view, original was 1040
        description: 'Height of the canvas'
      },
      num_foods: {
        type: jspsych.ParameterType.INT,
        pretty_name: 'Number of foods',
        default: null, 
        description: 'Number of target foods (1-2, null for random)'
      },
      target_score: {
        type: jspsych.ParameterType.INT,
        default: 1000,
        description: 'Score required to fill the pie chart'
      },
      current_total_score: {
        type: jspsych.ParameterType.INT,
        default: 0,
        description: 'Score accumulated from previous trials'
      },
      initial_snake_position: {
        type: jspsych.ParameterType.OBJECT,
        default: null,
        description: 'Initial snake position from previous trial [{x, y}, ...]'
      },
      initial_snake_direction: {
        type: jspsych.ParameterType.STRING,
        default: 'RIGHT',
        description: 'Initial snake direction'
      },
      grape_time_limit: {
        type: jspsych.ParameterType.INT,
        default: 10000,
        description: 'Time limit for grape collection in ms (10000 = 10s)'
      },
      body_size: {
        type: jspsych.ParameterType.FLOAT,
        pretty_name: 'Body size ratio',
        default: 1.0,
        description: 'Snake body width as ratio of GRID_SIZE (1.0 = same as head, 0.5 = half)'
      },
      head_size: {
        type: jspsych.ParameterType.FLOAT,
        pretty_name: 'Head size ratio',
        default: 2.5,
        description: 'Snake head size as ratio of GRID_SIZE (1.0 = normal, 1.5 = 50% larger)'
      },
      bush_size: {
        type: jspsych.ParameterType.FLOAT,
        pretty_name: 'Bush size ratio',
        default: 2.0,
        description: 'Bush size as ratio of GRID_SIZE (1.0 = normal, 1.5 = 50% larger)'
      },
      apple_size: {
        type: jspsych.ParameterType.FLOAT,
        pretty_name: 'Apple size ratio',
        default: 2.0,
        description: 'Apple/food size as ratio of GRID_SIZE (1.0 = normal, 2.0 = double)'
      }
    }
  };

  class Trial {
    constructor(jsPsych, display_element, trial) {
      this.jsPsych = jsPsych;
      this.display_element = display_element;
      this.trial = trial;
      
      // Constants
      this.GRID_SIZE = trial.grid_size;
      this.CANVAS_WIDTH = trial.canvas_width;
      this.CANVAS_HEIGHT = trial.canvas_height;
      this.SPEED = 6; // Frames per second
      
      // 实验设计: 20个灌木丛，每象限5个
      this.NUM_BUSHES_PER_QUADRANT = 5;
      this.TOTAL_BUSHES = 20;
      
      // Images
      this.images = {
        snakeHead: 'draws/snakehead3.png',
        snakeBody: 'draws/snakebody.png',
        apple: 'draws/apple.png', // Target food
        grapes: 'draws/grapes.png', // Special food / distractor
        bush: 'draws/bushes.png',
        appleCore: 'draws/apple_core.png'
      };
      
      this.loadedImages = {};
      
      // Audio
      this.audio = {
        background: 'audios/background.mp3',
        eat: 'audios/food.mp3',
        error: 'audios/error.mp3',
        crash: 'audios/crash.mp3',
        grapes: 'audios/grapes_eat.mp3',
        nextLevel: 'audios/next_level.mp3'
      };
      
      this.loadedAudio = {};

      // Colors for fallbacks and UI
      this.COLORS = {
        background: '#3c3c3c',
        text: '#FFFFFF',
        pie_fill: '#45CB85', // Greenish
        pie_bg: '#3c3c3c',
        pie_border: '#FFFFFF'
      };

      // Game State
      this.phase = 'init'; // init, show_food, freeze, move
      this.direction = 'RIGHT';
      this.nextDirection = 'RIGHT'; // Prevent 180 turn in one frame
      this.snake = [];
      this.targetFoods = []; // Array of {x, y, type}
      this.specialFood = null;
      this.bushLocations = [];
      this.allGridPoints = [];
      
      this.score = 0;
      // 处理动态参数：如果是函数则调用获取值
      this.totalScore = typeof trial.current_total_score === 'function' 
        ? trial.current_total_score() 
        : (trial.current_total_score || 0);
      this.gameOver = false;
      
      this.specialFoodActive = false;
      this.specialFoodTimer = null;
      this.hasSpecialFood = false;  // Whether special food was placed
      this.specialFoodT = null;     // When to activate (1 = start, 2 = after first food)
      
      // Data logging - matches Python current_trial structure exactly
      this.trialData = {
        trial_onset: null,
        food_presentation_end: null,
        food_number: null,
        change_display: 0,
        all_locs_xy: [],
        bush_locs_xy: [],
        key_presses_time: [],
        key_presses_direction: [],
        key_presses_key: [],
        reminder_onset: [],
        reminder_offset: [],
        calibration_offset: [],
        calibration_onset: [],
        time_to_find_food: [],
        time_to_find_food_corrected: [],
        food_order: [],
        initial_optimal_order: [],
        updated_optimal_order: [],
        time_to_nontarget: [],
        nontarget_order: [],
        time_to_dist: [],
        dist_order: [],
        eaten_type: [],      // 吃到的水果类型，按顺序记录 ['grape', 'apple', ...]
        eaten_position: [],  // 吃到的水果位置，按顺序记录 [[x,y], [x,y], ...]
        eaten_time: [],      // 吃到的水果时间，按顺序记录 [time1, time2, ...]
        food_locations: [],
        food_locs_xy: [],
        apple_locs_xy: [],
        banana_locs_xy: [],
        apple_quadrant: [],
        banana_quadrant: [],
        special_food: 0,
        special_food_onset: null,
        special_food_offset: null,
        special_food_T: null,
        special_food_loc: [],
        special_food_locs_xy: [],
        direction_changes_before_food: [],
        direction_changes_before_food_corrected: [],
        reminder_presses_before_food: [],
        nontarget_before_food: [],
        end_score: 0,
        subject_id: null,
        attempt_number: 1,
        snake_pos: [],
        gaze_pos: [],
        time: [],
        frozen_snake: [],
        frozen_time: [],
        gaze_pos_all: []
      };
      
      // Internal tracking (not exported directly)
      this._moveStartTime = null;
      this._directionChanges = 0;
      
      this.animationFrameId = null;
      this.lastFrameTime = 0;
      this.frameInterval = 1000 / this.SPEED;
      
      // New features
      this.snakeFrozen = false;         // For wrong location freeze
      this.frozenUntil = 0;             // Timestamp when freeze ends
      this.WRONG_LOC_FREEZE_DURATION = 1000;  // 1秒错误位置冻结
      this.reminderCount = 0;           // Track reminder usage
      
      // 苹果重显特效
      this.eatenFoodDisplay = null;     // {x, y, timer} 吃到的苹果位置
      this.EATEN_FOOD_DISPLAY_DURATION = 500; // 0.5秒重显
      
      // 苹果核显示
      this.wrongLocDisplay = null;      // {x, y, timer} 错误位置
      
      // 葡萄设定
      this.NUM_GRAPES = 3;              // 3颗葡萄
      this.grapesList = [];             // 多颗葡萄数组
      this.GRAPE_TIME_LIMIT = 10000;    // 10秒葡萄时间限制
      this.grapePhaseStartTime = null;  // 葡萄阶段开始时间
      
      // 蛇增长与分值自适应
      this.lastGrowthScore = 0;         // 上次增长时的分数
      this.scoreBonus = 0;              // 分值累加（每50分+1）
      
      // 防止endTrial重复调用
      this.trialEnded = false;
      
      // 分数变化显示（跟随蛇头，类似Python版本）
      this.scoreChangeText = null;      // 显示的文字，如 "+3" 或 "-1"
      this.scoreChangeColor = null;     // 文字颜色
      this.scoreChangeTimer = null;     // 开始显示的时间戳
      this.scoreChangeDuration = 1000;  // 显示持续时间（1秒）
      
      // 暂停功能
      this.isPaused = false;
      this.pauseStartTime = null;
      this.totalPausedTime = 0;
      
      // 撞墙提示
      this.isCrashed = false;
    }

    start() {
      this.loadAssets().then(() => {
        this.initDisplay();
        this.initGame();
        this.startGameLoop();
      });
    }

    async loadAssets() {
      // Load Images
      const imgPromises = Object.entries(this.images).map(([key, src]) => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            this.loadedImages[key] = img;
            resolve();
          };
          img.onerror = () => {
            console.warn(`Failed to load image: ${src}`);
            resolve(); // Continue anyway
          };
          img.src = src;
        });
      });

      // Load Audio
      const audioPromises = Object.entries(this.audio).map(([key, src]) => {
        return new Promise((resolve) => {
          const audio = new Audio(src);
          audio.addEventListener('canplaythrough', () => {
            this.loadedAudio[key] = audio;
            resolve();
          }, { once: true });
          // Fallback if audio fails or takes too long
          setTimeout(resolve, 1000); 
          audio.src = src;
          audio.load();
        });
      });

      await Promise.all([...imgPromises, ...audioPromises]);
    }

    initDisplay() {
      // 直接使用窗口尺寸，让画布填满整个屏幕
      const bottomBarHeight = 30; // 底部提示栏高度
      this.CANVAS_WIDTH = window.innerWidth;
      this.CANVAS_HEIGHT = window.innerHeight - bottomBarHeight;
      
      this.display_element.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: ${this.COLORS.background}; font-family: Arial, sans-serif; overflow: hidden; margin: 0; padding: 0;">
          <div id="canvas-container" style="position: relative;">
            <canvas id="snake-canvas" width="${this.CANVAS_WIDTH}" height="${this.CANVAS_HEIGHT}" 
              style="display: block; background-color: ${this.COLORS.background};">
            </canvas>
            <!-- Feedback Overlay -->
            <div id="feedback-overlay" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); 
              color: white; font-size: 48px; font-weight: bold; text-shadow: 2px 2px 4px #000; pointer-events: none; display: none;">
            </div>
          </div>
          <div style="height: ${bottomBarHeight}px; color: #888; font-size: 14px; display: flex; align-items: center;">方向键移动 | <strong>空格</strong> 暂停 | <strong>F</strong> 显示食物 | <strong>Q</strong> 退出</div>
        </div>
      `;
      
      this.canvas = this.display_element.querySelector('#snake-canvas');
      this.ctx = this.canvas.getContext('2d');
      this.feedbackOverlay = this.display_element.querySelector('#feedback-overlay');

      // Play background music loop
      if (this.loadedAudio.background) {
        this.loadedAudio.background.loop = true;
        this.loadedAudio.background.volume = 0.3;
        this.loadedAudio.background.play().catch(e => console.log("Audio play failed (interaction needed):", e));
      }
    }

    initGame() {
      // 1. Calculate Grid Points
      this.allGridPoints = this.calculateCenteredGridPoints();
      
      // 使用参数化的葡萄时间限制
      this.GRAPE_TIME_LIMIT = this.trial.grape_time_limit;
      
      // 2. Initialize Snake - 支持从上一试次继承位置
      // 处理动态参数：如果是函数则调用获取值
      const snakePosition = typeof this.trial.initial_snake_position === 'function'
        ? this.trial.initial_snake_position()
        : this.trial.initial_snake_position;
      const snakeDirection = typeof this.trial.initial_snake_direction === 'function'
        ? this.trial.initial_snake_direction()
        : this.trial.initial_snake_direction;
      
      console.log('[DEBUG] Snake position from previous trial:', snakePosition);
      console.log('[DEBUG] Snake direction from previous trial:', snakeDirection);
      console.log('[DEBUG] Total score from previous trial:', this.totalScore);
      
      if (snakePosition && Array.isArray(snakePosition) && snakePosition.length > 0) {
        // 从上一试次继承蛇的位置
        this.snake = snakePosition.map(p => ({ x: p.x, y: p.y }));
        this.direction = snakeDirection || 'RIGHT';
        this.nextDirection = this.direction;
      } else {
        // 第一个试次：蛇在屏幕中央，朝向右侧
        const centerX = this.CANVAS_WIDTH / 2;
        const centerY = this.CANVAS_HEIGHT / 2;
        const startHead = this.snapToGrid(centerX, centerY);
        
        this.snake = [
          { x: startHead.x, y: startHead.y },
          { x: startHead.x - this.GRID_SIZE, y: startHead.y },
          { x: startHead.x - 2 * this.GRID_SIZE, y: startHead.y }
        ];
        
        this.direction = 'RIGHT';
        this.nextDirection = 'RIGHT';
        
        // 蛇长度固定为3节，不再随分数增长
        console.log(`[INIT] Snake length fixed at ${this.snake.length}`);
      }
      
      // 3. Place Foods and Bushes
      this.placeFoods();
      
      // 4. Setup Listeners
      this.keyboardListener = (e) => {
        console.log('[GLOBAL] Key pressed:', e.key, 'code:', e.code);
        this.handleKeyPress(e);
      };
      document.addEventListener('keydown', this.keyboardListener);
      console.log('[INIT] Keyboard listener added successfully');
      
      // 5. Start Timing
      this.trialStartTime = performance.now();
      this.phase = 'show_food';
      this.phaseStartTime = this.trialStartTime;
      
      // Record trial data
      // trial_onset: 绝对时间戳（试次开始的那一刻）
      // Python 中 self.trial_start = pygame.time.get_ticks() 然后 trial_onset = self.trial_start
      this.trialData.trial_onset = this.trialStartTime;
      this.trialData.food_number = this.targetFoods.length;
      this.trialData.all_locs_xy = this.allGridPoints.map(p => [p.x, p.y]);
      this.trialData.bush_locs_xy = this.bushLocations.map(p => [p.x, p.y]);
      
      // calibration_onset/offset: 眼动校准（线上版本暂未使用，保留空数组）
      // 若后续接入 WebGazer 等眼动追踪，可在校准开始/结束时填充
      this.trialData.calibration_onset = [];
      this.trialData.calibration_offset = [];
      
      // Record initial snake position and time
      this.trialData.snake_pos.push([this.snake[0].x, this.snake[0].y]);
      this.trialData.time.push(0);
    }

    snapToGrid(x, y) {
      return {
        x: Math.floor(x / this.GRID_SIZE) * this.GRID_SIZE,
        y: Math.floor(y / this.GRID_SIZE) * this.GRID_SIZE
      };
    }

    calculateCenteredGridPoints() {
      // 实验设计: 生成20个灌木丛位置，每个象限5个
      // 最小间距调整为确保能生成足够的草丛
      const points = [];
      const minSpacing = this.GRID_SIZE * 2.0; // 放宽间距确保每象限能生成5个草丛
      
      const centerX = this.CANVAS_WIDTH / 2;
      const centerY = this.CANVAS_HEIGHT / 2;
      
      // 右上角饼图区域（需要排除）
      // 饼图位置: x = CANVAS_WIDTH - 80, y = 80, radius = 50
      const pieExclusionX = this.CANVAS_WIDTH - 180; // 从这个x坐标开始排除
      const pieExclusionY = 180; // 到这个y坐标为止排除
      
      // 定义四个象限的边界（留出边距和中心蛇的空间）
      // 增大边距使草丛距离边界更远
      const margin = this.GRID_SIZE * 3;
      const centerExclusion = this.GRID_SIZE * 4; // 中心区域排除（蛇的位置）
      
      const quadrantBounds = {
        1: { // 左上
          minX: margin, maxX: centerX - centerExclusion,
          minY: margin, maxY: centerY - centerExclusion
        },
        2: { // 右上
          minX: centerX + centerExclusion, maxX: this.CANVAS_WIDTH - margin,
          minY: margin, maxY: centerY - centerExclusion
        },
        4: { // 左下 (Python convention)
          minX: margin, maxX: centerX - centerExclusion,
          minY: centerY + centerExclusion, maxY: this.CANVAS_HEIGHT - margin
        },
        3: { // 右下
          minX: centerX + centerExclusion, maxX: this.CANVAS_WIDTH - margin,
          minY: centerY + centerExclusion, maxY: this.CANVAS_HEIGHT - margin
        }
      };
      
      // 为每个象限生成5个灌木丛位置
      for (const quadrant of [1, 2, 4, 3]) {
        const bounds = quadrantBounds[quadrant];
        const quadrantPoints = [];
        let attempts = 0;
        
        while (quadrantPoints.length < this.NUM_BUSHES_PER_QUADRANT && attempts < 1000) {
          attempts++;
          
          // 随机生成位置并对齐到网格
          const x = this.snapToGrid(
            bounds.minX + Math.random() * (bounds.maxX - bounds.minX),
            0
          ).x;
          const y = this.snapToGrid(
            0,
            bounds.minY + Math.random() * (bounds.maxY - bounds.minY)
          ).y;
          
          const newPoint = { x, y };
          
          // 检查与本象限已有点的最小间距（不跨象限约束，确保每象限能放满5个）
          const hasMinSpacing = quadrantPoints.every(p => 
            this.calculateDistance(newPoint, p) >= minSpacing
          );
          
          // 确保在象限边界内
          const inBounds = x >= bounds.minX && x <= bounds.maxX && 
                          y >= bounds.minY && y <= bounds.maxY;
          
          // 排除右上角饼图区域
          const notInPieArea = !(x >= pieExclusionX && y <= pieExclusionY);
          
          if (hasMinSpacing && inBounds && notInPieArea) {
            quadrantPoints.push(newPoint);
          }
        }
        
        points.push(...quadrantPoints);
      }
      
      // 调试日志：输出实际生成的草丛数量
      console.log(`[BUSH] Generated ${points.length} bushes (target: ${this.TOTAL_BUSHES})`);
      if (points.length < this.TOTAL_BUSHES) {
        console.warn(`[BUSH] Warning: Only generated ${points.length}/${this.TOTAL_BUSHES} bushes`);
      }
      
      return points;
    }

    getQuadrant(x, y) {
      const cx = this.CANVAS_WIDTH / 2;
      const cy = this.CANVAS_HEIGHT / 2;
      if (x < cx && y < cy) return 1; // Top-Left
      if (x >= cx && y < cy) return 2; // Top-Right
      if (x < cx && y >= cy) return 4; // Bottom-Left (Python logic uses 4 for BL)
      return 3; // Bottom-Right
    }

    getAvailablePositions(candidates) {
      // Filter out positions on snake path and future positions
      const futurePositions = new Set();
      const head = this.snake[0];
      
      // Add current snake body
      this.snake.forEach(s => futurePositions.add(`${s.x},${s.y}`));
      
      // Predict 5 moves ahead
      let currX = head.x;
      let currY = head.y;
      const moves = {
        'UP': {x:0, y:-this.GRID_SIZE},
        'DOWN': {x:0, y:this.GRID_SIZE},
        'LEFT': {x:-this.GRID_SIZE, y:0},
        'RIGHT': {x:this.GRID_SIZE, y:0}
      };
      const move = moves[this.direction];
      
      for(let i=0; i<5; i++) {
        currX += move.x;
        currY += move.y;
        futurePositions.add(`${currX},${currY}`);
      }
      
      return candidates.filter(p => !futurePositions.has(`${p.x},${p.y}`));
    }

    jitterPoint(point, existingPoints, maxJitter = null, minDistance = null) {
      // Python-style jitter with distance constraints
      // maxJitter defaults to GRID_SIZE / 2, minDistance defaults to GRID_SIZE * 3
      if (maxJitter === null) maxJitter = Math.floor(this.GRID_SIZE / 2);
      if (minDistance === null) minDistance = this.GRID_SIZE * 3;
      
      let jitteredPoint = point;
      let attempts = 0;
      let valid = false;
      
      while (!valid && attempts < 100) {
        const jitterX = Math.floor(Math.random() * (2 * maxJitter + 1)) - maxJitter;
        const jitterY = Math.floor(Math.random() * (2 * maxJitter + 1)) - maxJitter;
        
        // Snap to grid
        const newX = Math.floor((point.x + jitterX) / this.GRID_SIZE) * this.GRID_SIZE;
        const newY = Math.floor((point.y + jitterY) / this.GRID_SIZE) * this.GRID_SIZE;
        
        jitteredPoint = { x: newX, y: newY };
        
        // Check minimum distance constraint from all existing points
        valid = existingPoints.every(existingPoint => 
          this.calculateDistance(jitteredPoint, existingPoint) >= minDistance
        );
        
        attempts++;
      }
      
      return valid ? jitteredPoint : point;
    }
    
    selectRandomPointsWithJitter(quadrants, numPointsPerQuadrant = 4) {
      // Python-style: select points from each quadrant with jitter
      const selectedPoints = [];
      const allJitteredPoints = [];
      const quadrantOrder = [1, 2, 4, 3]; // top_left, top_right, bottom_left, bottom_right
      
      for (const quadrant of quadrantOrder) {
        const points = quadrants[quadrant] || [];
        
        // Apply jitter to all points in this quadrant
        const jitteredPoints = points.map(p => this.jitterPoint(p, allJitteredPoints));
        allJitteredPoints.push(...jitteredPoints);
        
        // Randomly select numPointsPerQuadrant from jittered points
        this.shuffleArray(jitteredPoints);
        const selected = jitteredPoints.slice(0, Math.min(numPointsPerQuadrant, jitteredPoints.length));
        selectedPoints.push(...selected);
      }
      
      return { allPoints: allJitteredPoints, selectedPoints };
    }
    
    calculateDistance(p1, p2) {
      // Euclidean distance between two points
      return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
    }
    
    getFoodLocationNumber(foodPoint, allLocs) {
      // Python: _get_food_location_number - returns 1-based index
      for (let i = 0; i < allLocs.length; i++) {
        if (allLocs[i].x === foodPoint.x && allLocs[i].y === foodPoint.y) {
          return i + 1; // 1-based index
        }
      }
      return null;
    }

    placeFoods() {
      // 1. Define Quadrants for all points
      const quadrants = {1:[], 2:[], 3:[], 4:[]};
      this.allGridPoints.forEach(p => {
        const q = this.getQuadrant(p.x, p.y);
        quadrants[q].push(p);
      });

      // 2. Determine Food Count (2 or 4 apples)
      let numFoods = this.trial.num_foods;
      if (numFoods === null) {
        // 随机选择 2 或 4 个苹果
        numFoods = Math.random() < 0.5 ? 2 : 4;
      }

      // 3. 过滤掉蛇前方安全距离内的草丛位置
      // 安全距离：蛇正前方5个格子内不放草丛，给玩家足够的反应时间
      const safeDistance = this.GRID_SIZE * 5;
      const snakeHead = this.snake[0];
      const snakeDir = this.direction;
      
      // 计算蛇前方的区域
      const isInSnakePath = (point) => {
        const dx = point.x - snakeHead.x;
        const dy = point.y - snakeHead.y;
        
        // 检查是否在蛇的移动方向上
        switch(snakeDir) {
          case 'RIGHT':
            // 蛇向右移动，排除蛇右前方的区域
            return dx > 0 && dx <= safeDistance && Math.abs(dy) <= this.GRID_SIZE * 2;
          case 'LEFT':
            // 蛇向左移动，排除蛇左前方的区域
            return dx < 0 && dx >= -safeDistance && Math.abs(dy) <= this.GRID_SIZE * 2;
          case 'UP':
            // 蛇向上移动，排除蛇上前方的区域
            return dy < 0 && dy >= -safeDistance && Math.abs(dx) <= this.GRID_SIZE * 2;
          case 'DOWN':
            // 蛇向下移动，排除蛇下前方的区域
            return dy > 0 && dy <= safeDistance && Math.abs(dx) <= this.GRID_SIZE * 2;
          default:
            return false;
        }
      };
      
      // 过滤掉蛇前方的位置
      const safePoints = this.allGridPoints.filter(p => !isInSnakePath(p));
      
      // 草丛始终使用完整的 allGridPoints（保证每象限 5 个）
      this.bushLocations = [...this.allGridPoints];
      console.log(`[BUSH] Total bushes: ${this.bushLocations.length} (20 expected)`);
      
      // 4. Place Target Foods (1, 2, or 4 apples)
      // 实验设计: 在随机选定的灌木丛上方出现苹果
      this.targetFoods = [];
      const snakeQuad = this.getQuadrant(this.snake[0].x, this.snake[0].y);
      
      // 从安全点（非蛇前方）中选取苹果位置，排除蛇所在象限
      const allowedBushes = safePoints.filter(b => this.getQuadrant(b.x, b.y) !== snakeQuad);
      
      // 打乱顺序并选择 numFoods 个位置
      this.shuffleArray(allowedBushes);
      
      // 尝试在不同象限放置食物
      const selectedFoods = [];
      const usedQuadrants = new Set();
      
      // 首先尝试选择不同象限的灌木丛
      for (const bush of allowedBushes) {
        if (selectedFoods.length >= numFoods) break;
        const q = this.getQuadrant(bush.x, bush.y);
        if (!usedQuadrants.has(q) || selectedFoods.length >= 3) {
          selectedFoods.push(bush);
          usedQuadrants.add(q);
        }
      }
      
      // 如果不够，从剩余的选择
      for (const bush of allowedBushes) {
        if (selectedFoods.length >= numFoods) break;
        if (!selectedFoods.includes(bush)) {
          selectedFoods.push(bush);
        }
      }
      
      // 添加所有选中的食物（都是苹果）
      for (const food of selectedFoods) {
        this.targetFoods.push({ ...food, type: 'apple' });
        const quadrant = this.getQuadrant(food.x, food.y);
        this.trialData.food_locs_xy.push([food.x, food.y]);
        this.trialData.apple_locs_xy.push([food.x, food.y]);
        this.trialData.apple_quadrant.push(quadrant);
      }
      
      // Calculate initial optimal order (sorted by distance)
      if (this.targetFoods.length > 1) {
        const distances = this.targetFoods.map((f, i) => ({
          index: i,
          dist: this.calculateDistance(f, this.snake[0])
        }));
        distances.sort((a, b) => a.dist - b.dist);
        this.trialData.initial_optimal_order = distances.map(d => d.index);
      }
      
      // 5. Place Special Food (Distractor) - 50%干扰试次
      // 3颗葡萄，距离任何灌木丛至少2.2°
      this.specialFoodT = null;
      this.grapesList = [];
      this.hasSpecialFood = false;
      
      if (Math.random() < 0.5) { // 50%概率出现葡萄
          this.specialFoodT = 1; // Activate from start of move phase
          this.hasSpecialFood = true;
          
          // 生成3颗葡萄的位置，确保距离灌木丛至少 GRID_SIZE
          const minDistFromBush = this.GRID_SIZE * 2; // 2.2°
          const margin = this.GRID_SIZE * 3;
          
          // 右上角饼图区域（需要排除）
          const pieExclusionX = this.CANVAS_WIDTH - 180;
          const pieExclusionY = 180;
          
          let attempts = 0;
          while (this.grapesList.length < this.NUM_GRAPES && attempts < 500) {
            attempts++;
            
            // 随机生成位置
            const x = this.snapToGrid(
              margin + Math.random() * (this.CANVAS_WIDTH - 2 * margin),
              0
            ).x;
            const y = this.snapToGrid(
              0,
              margin + Math.random() * (this.CANVAS_HEIGHT - 2 * margin)
            ).y;
            
            const newGrape = { x, y, type: 'grapes' };
            
            // 检查与灌木丛的距离
            const farFromBushes = this.bushLocations.every(bush => 
              this.calculateDistance(newGrape, bush) >= minDistFromBush
            );
            
            // 检查与其他葡萄的距离
            const farFromOtherGrapes = this.grapesList.every(grape => 
              this.calculateDistance(newGrape, grape) >= this.GRID_SIZE
            );
            
            // 检查不在蛇身上
            const notOnSnake = !this.snake.some(s => s.x === x && s.y === y);
            
            // 排除右上角饼图区域
            const notInPieArea = !(x >= pieExclusionX && y <= pieExclusionY);
            
            if (farFromBushes && farFromOtherGrapes && notOnSnake && notInPieArea) {
              this.grapesList.push(newGrape);
            }
          }
          
          // Record special food data
          if (this.grapesList.length > 0) {
            this.trialData.special_food = 1;
            this.trialData.special_food_T = this.specialFoodT;
            for (const grape of this.grapesList) {
              this.trialData.special_food_locs_xy.push([grape.x, grape.y]);
              // Record the index position in all_locs_xy (1-based)
              const locIndex = this.getFoodLocationNumber(grape, this.allGridPoints);
              if (locIndex !== null) {
                this.trialData.special_food_loc.push(locIndex);
              }
            }
            
            // Calculate updated_optimal_order: 从第一个葡萄位置到各个苹果的最优顺序
            // Python 版本: updated_optimal_order = np.argmin(food_distances)
            // 计算从第一个葡萄到每个苹果的距离，返回按距离排序的苹果索引
            if (this.targetFoods.length > 0 && this.grapesList.length > 0) {
              const firstGrape = this.grapesList[0];
              const distances = this.targetFoods.map((food, index) => ({
                index: index,
                dist: this.calculateDistance(food, firstGrape)
              }));
              distances.sort((a, b) => a.dist - b.dist);
              this.trialData.updated_optimal_order = distances.map(d => d.index);
            }
          }
      }
      
      // Save food_locations (1-based index in all_locations)
      this.trialData.food_locations = this.targetFoods.map(f => 
        this.getFoodLocationNumber(f, this.allGridPoints)
      );
    }

    handleKeyPress(e) {
      // 空格键暂停/继续
      if (e.code === 'Space') {
        e.preventDefault();
        this.togglePause();
        return;
      }
      
      // 暂停时忽略其他按键（除了Q键退出）
      if (this.isPaused && e.key !== 'q' && e.key !== 'Q') {
        return;
      }
      
      // Q key to quit and save data
      if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        this.endTrial('manual_quit');
        return;
      }
      
      // Handle Reminder key (F) - works in move phase
      if (e.key === 'f' || e.key === 'F') {
        console.log('[DEBUG] F pressed, phase:', this.phase, 'frozen:', this.snakeFrozen, 'targetFoods:', this.targetFoods.length);
        if (this.phase === 'move' && !this.snakeFrozen) {
          e.preventDefault();
          console.log('[DEBUG] Triggering reminder...');
          this.triggerReminder();
        } else {
          console.log('[DEBUG] F key ignored - phase:', this.phase, 'frozen:', this.snakeFrozen);
        }
        return;
      }
      
      if (this.phase !== 'move') return;
      if (this.snakeFrozen) return; // Can't move when frozen
      
      const keyMap = {
        'ArrowUp': 'UP',
        'ArrowDown': 'DOWN',
        'ArrowLeft': 'LEFT',
        'ArrowRight': 'RIGHT'
      };
      
      const newDir = keyMap[e.key];
      if (!newDir) return;
      
      e.preventDefault();
      
      // Prevent reversing direction
      const opposites = {'UP':'DOWN', 'DOWN':'UP', 'LEFT':'RIGHT', 'RIGHT':'LEFT'};
      if (opposites[newDir] !== this.direction) {
        this.nextDirection = newDir; // Buffer the input
        this._directionChanges++;
      }
      
      // Python style: separate arrays for time, direction, key
      // 使用绝对时间（从页面加载开始）
      this.trialData.key_presses_time.push(performance.now());
      this.trialData.key_presses_direction.push(this.direction); // Current direction before change
      this.trialData.key_presses_key.push(e.key);
    }

    triggerReminder() {
      // Show food positions again (with -1 score penalty)
      // 使用绝对时间（从页面加载开始）
      this.trialData.reminder_onset.push(performance.now());
      this.reminderCount++;
      
      // Apply penalty
      this.score -= 1;
      this.totalScore -= 1;
      this.playSound('error');
      this.showFeedback("-1 (提醒)", "orange");
      
      // Enter reminder phase (show food)
      this.phase = 'reminder_show';
      this.phaseStartTime = performance.now();
    }
    
    endReminder() {
      // After reminder show, enter freeze then back to move
      // 使用绝对时间（从页面加载开始）
      this.trialData.reminder_offset.push(performance.now());
      this.trialData.reminder_presses_before_food.push(this.reminderCount);
      
      // Record frozen snake position and time when entering reminder_freeze phase
      // 使用绝对时间（从页面加载开始）
      this.trialData.frozen_snake.push([this.snake[0].x, this.snake[0].y]);
      this.trialData.frozen_time.push(performance.now());
      
      this.phase = 'reminder_freeze';
      this.phaseStartTime = performance.now();
    }
    
    // 暂停/继续游戏
    togglePause() {
      if (this.isPaused) {
        // 继续游戏
        const pauseDuration = performance.now() - this.pauseStartTime;
        this.totalPausedTime += pauseDuration;
        this.isPaused = false;
        this.pauseStartTime = null;
        console.log('[PAUSE] Game resumed. Total paused time:', this.totalPausedTime);
      } else {
        // 暂停游戏
        this.isPaused = true;
        this.pauseStartTime = performance.now();
        console.log('[PAUSE] Game paused');
      }
    }

    startGameLoop() {
      requestAnimationFrame((t) => this.gameLoop(t));
    }

    gameLoop(timestamp) {
      // 如果游戏结束且不是撞墙状态，停止循环
      if (this.gameOver && !this.isCrashed) return;
      
      // Handle pause state
      if (this.isPaused) {
        // Still render but don't update game state
        this.render();
        this.drawPauseOverlay();
        this.animationFrameId = requestAnimationFrame((t) => this.gameLoop(t));
        return;
      }
      
      // Handle crash state (Game Over but showing message)
      if (this.isCrashed) {
        this.render();
        this.animationFrameId = requestAnimationFrame((t) => this.gameLoop(t));
        return;
      }

      const deltaTime = timestamp - this.lastFrameTime;

      // Update Phase Logic
      const timeElapsed = performance.now() - this.phaseStartTime;
      
      if (this.phase === 'show_food' && timeElapsed > this.trial.show_food_duration) {
        // Transition to freeze phase
        // 使用绝对时间（从页面加载开始）
        this.trialData.food_presentation_end = performance.now();
        this.phase = 'freeze';
        this.phaseStartTime = performance.now();
        
        // Record frozen snake position and time
        // 使用绝对时间（从页面加载开始）
        this.trialData.frozen_snake.push([this.snake[0].x, this.snake[0].y]);
        this.trialData.frozen_time.push(performance.now());
        
      } else if (this.phase === 'freeze' && timeElapsed > this.trial.freeze_duration) {
        // Transition to move phase
        this.phase = 'move';
        this.phaseStartTime = performance.now();
        this._moveStartTime = performance.now();
        this._directionChanges = 0;
        
        // Activate special food (grapes) logic
        if (this.hasSpecialFood && this.specialFoodT === 1 && this.grapesList.length > 0) {
            this.specialFoodActive = true;
            this.grapePhaseStartTime = performance.now();
            // 使用绝对时间（从页面加载开始）
            this.trialData.special_food_onset = performance.now();
        }
      } else if (this.phase === 'reminder_show' && timeElapsed > this.trial.show_food_duration) {
        // End reminder show phase
        this.endReminder();
      } else if (this.phase === 'reminder_freeze' && timeElapsed > this.trial.freeze_duration) {
        // Return to move phase after reminder
        this.phase = 'move';
        this.phaseStartTime = performance.now();
        this._directionChanges = 0;
      }

      // Check if snake is still frozen (wrong location penalty)
      if (this.snakeFrozen && performance.now() >= this.frozenUntil) {
        this.snakeFrozen = false;
      }
      
      // 检查葡萄时间限制（10秒后自动结束葡萄阶段）
      if (this.specialFoodActive && this.grapePhaseStartTime) {
        const grapeTimeElapsed = performance.now() - this.grapePhaseStartTime;
        if (grapeTimeElapsed >= this.GRAPE_TIME_LIMIT) {
          // 时间到，结束葡萄阶段，继续找苹果
          this.specialFoodActive = false;
          this.grapesList = [];
          this.trialData.special_food_offset = performance.now() - this.trialStartTime;
          this.showFeedback("时间到！继续找苹果！", "#FFA500");
        }
      }
      
      // Game Update (at fixed speed)
      if (deltaTime >= this.frameInterval) {
        this.lastFrameTime = timestamp;
        
        if (this.phase === 'move' && !this.snakeFrozen) {
           this.updateSnake();
           this.checkCollisions();
        }
        
        // Render every frame (or strictly on tick)
        this.render();
        
        // Check End Conditions
        if (this.targetFoods.length === 0) {
            // Level Complete
            this.playSound('nextLevel');
            this.endTrial('completed');
            return;
        }
      }
      
      // Check Trial Timeout
      if (performance.now() - this.trialStartTime > this.trial.trial_duration) {
        this.endTrial('timeout');
        return;
      }

      this.animationFrameId = requestAnimationFrame((t) => this.gameLoop(t));
    }

    updateSnake() {
      this.direction = this.nextDirection; // Apply buffered direction
      
      const head = { ...this.snake[0] };
      switch(this.direction) {
        case 'UP': head.y -= this.GRID_SIZE; break;
        case 'DOWN': head.y += this.GRID_SIZE; break;
        case 'LEFT': head.x -= this.GRID_SIZE; break;
        case 'RIGHT': head.x += this.GRID_SIZE; break;
      }
      
      this.snake.unshift(head);
      this.snake.pop();
      
      // Log path - Python style: separate arrays for snake_pos and time
      // 使用绝对时间（从页面加载开始）
      this.trialData.snake_pos.push([head.x, head.y]);
      this.trialData.time.push(performance.now());
    }

    checkCollisions() {
      const head = this.snake[0];
      
      // 1. Wall Collision - 参考 template.py，直接进入下一轮
      if (head.x < 0 || head.x >= this.CANVAS_WIDTH || head.y < 0 || head.y >= this.CANVAS_HEIGHT) {
        this.playSound('crash');
        this.gameOver = true;
        this.isCrashed = true; // 标记为撞墙状态
        
        // 延迟2秒后退出
        setTimeout(() => {
          this.endTrial('crash');
        }, 2000);
        return;
      }
      
      // 2. Self Collision - 参考 template.py，直接进入下一轮
      for (let i = 1; i < this.snake.length; i++) {
        if (head.x === this.snake[i].x && head.y === this.snake[i].y) {
          this.playSound('crash');
          this.gameOver = true;
          this.endTrial('self_collision');
          return;
        }
      }
      
      // 3. Food Collision (Target Food)
      const foodIdx = this.targetFoods.findIndex(f => f.x === head.x && f.y === head.y);
      if (foodIdx !== -1) {
        // 使用绝对时间（从页面加载开始）
        const currentTime = performance.now();
        const correctedTime = currentTime - this._moveStartTime;
        
        // Eat Food
        const food = this.targetFoods.splice(foodIdx, 1)[0];
        const pointsEarned = 1 + this.scoreBonus;
        this.score += pointsEarned;
        this.totalScore += pointsEarned;
        this.playSound('eat');
        this.setScoreChange(`+${pointsEarned}`, "#00FF00");
        
        // 苹果在原位置重新显示0.5秒
        this.eatenFoodDisplay = { x: food.x, y: food.y, timer: performance.now() };
        
        // 蛇身每10分增长2.2°（增加一节）
        this.checkSnakeGrowth();
        // 检查分值累加（每50分+1）
        this.checkScoreBonus();
        
        // 仅当葡萄是"吃完第一个苹果后才出现"模式时，吃苹果才关闭葡萄
        if (this.specialFoodT === 2) {
          this.specialFoodActive = false;
        }
        
        // Record Python-style data
        this.trialData.time_to_find_food.push(currentTime);
        this.trialData.time_to_find_food_corrected.push(correctedTime);
        this.trialData.food_order.push(this.getFoodLocationNumber(head, this.allGridPoints));
        this.trialData.direction_changes_before_food_corrected.push(this._directionChanges);
        
        // 记录到 eaten 系列字段（拆分为3个独立数组）
        this.trialData.eaten_type.push('apple');
        this.trialData.eaten_position.push([food.x, food.y]);
        this.trialData.eaten_time.push(currentTime);
        
        // Reset direction changes counter for next food
        this._directionChanges = 0;
        this._moveStartTime = performance.now();
        
        // If more foods remain and special_food_T = 2, activate special food
        if (this.targetFoods.length > 0 && this.specialFoodT === 2 && this.hasSpecialFood && !this.specialFoodActive) {
          this.specialFoodActive = true;
          this.specialFoodTimer = performance.now();
          // 使用绝对时间（从页面加载开始）
          this.trialData.special_food_onset = performance.now();
        }
        
        return;
      }
      
      // 4. Special Food (Grapes) Collision - 支持多颗葡萄
      if (this.specialFoodActive && this.grapesList.length > 0) {
        const grapeIdx = this.grapesList.findIndex(g => g.x === head.x && g.y === head.y);
        if (grapeIdx !== -1) {
          // 使用绝对时间（从页面加载开始）
          const currentTime = performance.now();
          
          // 保存被吃的葡萄对象（在移除之前）
          const eatenGrape = this.grapesList[grapeIdx];
          
          // 移除被吃的葡萄
          this.grapesList.splice(grapeIdx, 1);
          
          const pointsEarned = 3 + this.scoreBonus;
          this.score += pointsEarned;
          this.totalScore += pointsEarned;
          this.playSound('grapes');
          this.setScoreChange(`+${pointsEarned}`, "#FFD700");
          
          // 吃到葡萄后不冻结，继续移动
          
          // 蛇身每10分增长2.2°（增加一节）
          this.checkSnakeGrowth();
          this.checkScoreBonus();
          
          // 检查是否达到目标分数 (1000)
          if (this.totalScore >= this.trial.target_score) {
             this.endTrial('goal_reached');
             return;
          }
          
          // Record Python-style data
          // dist_order 记录葡萄的网格坐标位置，按照吃掉的顺序记录
          this.trialData.time_to_dist.push(currentTime);
          // 直接记录被吃掉的葡萄的坐标位置 [x, y]
          this.trialData.dist_order.push([eatenGrape.x, eatenGrape.y]);
          
          // 记录到 eaten 系列字段（拆分为3个独立数组）
          this.trialData.eaten_type.push('grape');
          this.trialData.eaten_position.push([eatenGrape.x, eatenGrape.y]);
          this.trialData.eaten_time.push(currentTime);
          
          // 吃完葡萄后，更新 updated_optimal_order（从当前蛇头位置到剩余苹果的最优顺序）
          if (this.targetFoods.length > 0) {
            const currentHead = this.snake[0];
            const distances = this.targetFoods.map((food, index) => ({
              index: index,
              dist: this.calculateDistance(food, currentHead)
            }));
            distances.sort((a, b) => a.dist - b.dist);
            // 追加到 updated_optimal_order 数组，记录每次吃完葡萄后的最优顺序
            this.trialData.updated_optimal_order = distances.map(d => d.index);
          }
          
          // 如果所有葡萄都被吃完，记录结束时间
          if (this.grapesList.length === 0) {
            this.trialData.special_food_offset = currentTime;
            this.specialFoodActive = false;
          }
          
          return;
        }
      }
      
      // 5. Bush (Wrong Location) Collision
      // If hitting a bush that contains NO food
      const isBush = this.bushLocations.some(b => b.x === head.x && b.y === head.y);
      // We already checked Target and Special food. So if isBush is true here, it's an empty bush.
      if (isBush) {
         this.score -= 1;
         this.totalScore -= 1;
         this.playSound('error');
         this.setScoreChange("-1", "#FF0000");
         
         // 显示苹果核图像
         this.wrongLocDisplay = { x: head.x, y: head.y, timer: performance.now() };
         
         // 错误位置冻结1秒
         this.snakeFrozen = true;
         this.frozenUntil = performance.now() + this.WRONG_LOC_FREEZE_DURATION;
         
         // Record nontarget data (Python style)
         // 使用绝对时间（从页面加载开始）
         this.trialData.time_to_nontarget.push(performance.now());
         this.trialData.nontarget_order.push(this.getFoodLocationNumber(head, this.allGridPoints));
         this.trialData.nontarget_before_food.push(1);
      }
    }

    render() {
      // Clear
      this.ctx.fillStyle = this.COLORS.background;
      this.ctx.fillRect(0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);
      
      // 1. Draw Bushes (All Phases)
      // Python draws bushes at all 'potential' locations
      for (let bush of this.bushLocations) {
        this.drawImage('bush', bush.x, bush.y);
      }
      
      // 2. Draw Target Foods (Only in Show Food Phase and Reminder Phase)
      // In Move and Freeze phases, target foods are HIDDEN (player must remember)
      if (this.phase === 'show_food' || this.phase === 'reminder_show') {
        for (let food of this.targetFoods) {
          this.drawImage('apple', food.x, food.y);
        }
      }
      
      // Draw Special Food (多颗葡萄) - only in move phase when active
      if (this.phase === 'move' && this.specialFoodActive && this.grapesList.length > 0) {
        for (const grape of this.grapesList) {
          this.drawImage('grapes', grape.x, grape.y);
        }
      }
      
      // 显示吃到的苹果（0.5秒重显）
      if (this.eatenFoodDisplay) {
        if (performance.now() - this.eatenFoodDisplay.timer < this.EATEN_FOOD_DISPLAY_DURATION) {
          this.drawImage('apple', this.eatenFoodDisplay.x, this.eatenFoodDisplay.y);
        } else {
          this.eatenFoodDisplay = null;
        }
      }
      
      // 3. Draw Snake
      // Freeze Phase: Only draw HEAD with shrinking circle (Python style)
      if (this.phase === 'freeze' || this.phase === 'reminder_freeze') {
         const head = this.snake[0];
         
         // Draw shrinking circle indicator (Python style)
         const timeElapsed = performance.now() - this.phaseStartTime;
         const remaining = Math.max(0, this.trial.freeze_duration - timeElapsed);
         const ratio = remaining / this.trial.freeze_duration;
         const circleRadius = (this.GRID_SIZE + 10) * ratio;
         
         this.ctx.fillStyle = '#4BB3FD';
         this.ctx.beginPath();
         this.ctx.arc(head.x + this.GRID_SIZE/2, head.y + this.GRID_SIZE/2, circleRadius, 0, Math.PI*2);
         this.ctx.fill();
      } else if (this.snakeFrozen) {
         // Snake is frozen due to wrong location - draw with red blinking effect
         const blinkPhase = Math.floor((performance.now() - (this.frozenUntil - this.WRONG_LOC_FREEZE_DURATION)) / 200) % 2;
         
         // Draw body (2.2° × 4.4° rectangles)
         for (let i = 1; i < this.snake.length; i++) {
           this.drawSnakeBody(this.snake[i].x, this.snake[i].y, i);
         }
         // Draw head with blink effect
         if (blinkPhase === 0) {
           this.drawSnakeHead(this.snake[0].x, this.snake[0].y);
         } else {
           // Draw red tinted head
           this.ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
           this.ctx.fillRect(this.snake[0].x, this.snake[0].y, this.GRID_SIZE, this.GRID_SIZE);
           this.drawSnakeHead(this.snake[0].x, this.snake[0].y);
         }
         
         // Draw remaining freeze time
         const remainingMs = Math.max(0, this.frozenUntil - performance.now());
         this.ctx.fillStyle = 'red';
         this.ctx.font = '16px Arial';
         this.ctx.textAlign = 'center';
         this.ctx.fillText(`冻结: ${(remainingMs/1000).toFixed(1)}秒`, this.snake[0].x + this.GRID_SIZE/2, this.snake[0].y - 10);
      } else {
         // Draw Body (2.2° × 4.4° rectangles)
         for (let i = 1; i < this.snake.length; i++) {
           this.drawSnakeBody(this.snake[i].x, this.snake[i].y, i);
         }
         // Draw Head (rotated based on direction)
         this.drawSnakeHead(this.snake[0].x, this.snake[0].y);
      }
      
      // 显示苹果核（错误位置）- 在蛇之后绘制，这样不会被蛇覆盖
      if (this.wrongLocDisplay) {
        if (performance.now() - this.wrongLocDisplay.timer < this.WRONG_LOC_FREEZE_DURATION) {
          this.drawImage('appleCore', this.wrongLocDisplay.x, this.wrongLocDisplay.y);
        } else {
          this.wrongLocDisplay = null;
        }
      }
      
      // 4. Draw score change text near snake head (like Python version)
      this.drawScoreChange();
      
      // 5. Draw HUD (Pie Chart & Score)
      this.drawHUD();
      
      // 6. Draw Crash Message if crashed
      if (this.isCrashed) {
        this.drawCrashMessage();
      }
    }
    
    // Draw pause overlay
    drawPauseOverlay() {
      // Semi-transparent overlay
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      this.ctx.fillRect(0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);
      
      // Pause text
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.font = 'bold 48px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('游戏暂停', this.CANVAS_WIDTH / 2, this.CANVAS_HEIGHT / 2 - 30);
      
      // Resume hint
      this.ctx.font = '24px Arial';
      this.ctx.fillStyle = '#4BB3FD';
      this.ctx.fillText('按 空格键 继续游戏', this.CANVAS_WIDTH / 2, this.CANVAS_HEIGHT / 2 + 30);
    }
    
    // Draw crash message
    drawCrashMessage() {
      // Semi-transparent overlay
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      this.ctx.fillRect(0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);
      
      // Crash text
      this.ctx.fillStyle = '#FF4444';
      this.ctx.font = 'bold 48px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('小蛇撞晕了', this.CANVAS_WIDTH / 2, this.CANVAS_HEIGHT / 2 - 30);
      
      // Next round hint
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.font = '24px Arial';
      this.ctx.fillText('开始下一把...', this.CANVAS_WIDTH / 2, this.CANVAS_HEIGHT / 2 + 30);
    }
    
    // Draw score change text near snake head (Python style)
    drawScoreChange() {
      if (this.scoreChangeTimer && this.scoreChangeText) {
        const elapsed = performance.now() - this.scoreChangeTimer;
        if (elapsed < this.scoreChangeDuration) {
          const head = this.snake[0];
          this.ctx.font = 'bold 24px Arial';
          this.ctx.fillStyle = this.scoreChangeColor || '#FFFFFF';
          this.ctx.textAlign = 'center';
          // Display below the snake head (offset by GRID_SIZE + 10)
          this.ctx.fillText(this.scoreChangeText, head.x + this.GRID_SIZE/2, head.y + this.GRID_SIZE + 20);
        } else {
          // Clear after duration
          this.scoreChangeText = null;
          this.scoreChangeTimer = null;
        }
      }
    }
    
    // Set score change display (called when eating food, hitting wrong location, etc.)
    setScoreChange(text, color) {
      this.scoreChangeText = text;
      this.scoreChangeColor = color;
      this.scoreChangeTimer = performance.now();
    }
    
    drawImage(key, x, y) {
      let size = this.GRID_SIZE;
      let drawX = x;
      let drawY = y;
      
      if (key === 'bush') {
        const bushScale = this.trial.bush_size || 1.0;
        size = this.GRID_SIZE * bushScale;
        // Center bush on the grid cell center
        drawX = x + (this.GRID_SIZE - size) / 2;
        drawY = y + (this.GRID_SIZE - size) / 2;
      } else if (key === 'apple' || key === 'grapes' || key === 'appleCore') {
        // Apple/grapes use apple_size (fallback to bush_size) and are centered on the grid cell center
        const appleScale = (this.trial.apple_size !== undefined && this.trial.apple_size !== null)
          ? this.trial.apple_size
          : (this.trial.bush_size || 1.0);
        size = this.GRID_SIZE * appleScale;
        drawX = x + (this.GRID_SIZE - size) / 2;
        drawY = y + (this.GRID_SIZE - size) / 2;
      }
      
      if (this.loadedImages[key]) {
        this.ctx.drawImage(this.loadedImages[key], drawX, drawY, size, size);
      } else {
        // Fallback
        this.ctx.fillStyle = key === 'snakeHead' ? '#4BB3FD' : (key === 'apple' ? 'red' : 'gray');
        this.ctx.fillRect(drawX, drawY, size, size);
      }
    }
    
    // Draw rotated image (for snake head direction) - matches Python pygame.transform.rotate
    drawRotatedImage(key, x, y, angleDegrees) {
      const img = this.loadedImages[key];
      if (!img) {
        this.ctx.fillStyle = '#4BB3FD';
        this.ctx.fillRect(x, y, this.GRID_SIZE, this.GRID_SIZE);
        return;
      }
      
      this.ctx.save();
      this.ctx.translate(x + this.GRID_SIZE/2, y + this.GRID_SIZE/2);
      this.ctx.rotate(angleDegrees * Math.PI / 180);
      this.ctx.drawImage(img, -this.GRID_SIZE/2, -this.GRID_SIZE/2, this.GRID_SIZE, this.GRID_SIZE);
      this.ctx.restore();
    }
    
    // Draw snake head with rotation based on current direction
    // snakehead3.png faces DOWN by default
    // RIGHT -> rotate 270°, LEFT -> rotate 90°, UP -> 180°, DOWN -> 0°
    // head_size parameter controls the size ratio (1.0 = GRID_SIZE, 1.5 = 50% larger)
    drawSnakeHead(x, y) {
      const rotationMap = {
        'UP': 180,
        'DOWN': 0,
        'LEFT': 90,
        'RIGHT': 270
      };
      const angle = rotationMap[this.direction] || 0;
      
      // Get head size from parameter (default 1.0 = GRID_SIZE)
      const headScale = this.trial.head_size || 1.0;
      const headSize = this.GRID_SIZE * headScale;
      
      const img = this.loadedImages['snakeHead'];
      if (!img) {
        this.ctx.fillStyle = '#4BB3FD';
        this.ctx.fillRect(x, y, headSize, headSize);
        return;
      }
      
      this.ctx.save();
      this.ctx.translate(x + this.GRID_SIZE/2, y + this.GRID_SIZE/2);
      this.ctx.rotate(angle * Math.PI / 180);
      this.ctx.drawImage(img, -headSize/2, -headSize/2, headSize, headSize);
      this.ctx.restore();
    }
    
    // Draw snake body segment as continuous blue rectangle (2.2° width × 4.4° length)
    // Body forms a seamless "pipe" by drawing rectangles that extend toward the previous segment
    // body_size parameter controls the width ratio (1.0 = full GRID_SIZE, 0.5 = half)
    drawSnakeBody(x, y, segmentIndex) {
      const BLUE1 = '#4BB3FD';  // Same as Python BLUE1 = (75, 179, 253)
      this.ctx.fillStyle = BLUE1;

      // Get body width from parameter (default 1.0 = full grid size)
      const bodyRatio = this.trial.body_size || 1.0;
      const bodyWidth = Math.floor(this.GRID_SIZE * bodyRatio);
      const bodyLength = this.GRID_SIZE*2 ;  // 4.4° = 2 × GRID_SIZE (2.2°)
      const offset = Math.floor((this.GRID_SIZE - bodyWidth) / 2);  // Center the body

      // Determine direction from current segment towards previous (head direction)
      const prevSegment = this.snake[segmentIndex - 1];
      const currSegment = this.snake[segmentIndex];
      
      if (prevSegment && currSegment) {
        const dx = prevSegment.x - currSegment.x;
        const dy = prevSegment.y - currSegment.y;
        
        if (dx !== 0) {
          // Horizontal movement: draw wide rectangle extending toward prev segment
          const rectX = dx > 0 ? x : x - this.GRID_SIZE;
          this.ctx.fillRect(rectX, y + offset, bodyLength, bodyWidth);
        } else {
          // Vertical movement: draw tall rectangle extending toward prev segment
          const rectY = dy > 0 ? y : y - this.GRID_SIZE;
          this.ctx.fillRect(x + offset, rectY, bodyWidth, bodyLength);
        }
      } else {
        // Fallback: just draw a square at current position
        this.ctx.fillRect(x + offset, y + offset, bodyWidth, bodyWidth);
      }
    }
    
    // 检查蛇增长（每10分增长1格，基于当前局得分）
    checkSnakeGrowth() {
      const growthInterval = 10;
      if (Math.floor(this.score / growthInterval) > Math.floor(this.lastGrowthScore / growthInterval)) {
        // 增加一节蛇身
        const tail = this.snake[this.snake.length - 1];
        this.snake.push({ x: tail.x, y: tail.y });
        this.lastGrowthScore = this.score;
        this.playSound('nextLevel');
      }
    }
    
    // 检查分值累加（每50分苹果+1、葡萄+1）
    checkScoreBonus() {
      const newBonus = Math.floor(this.totalScore / 50);
      if (newBonus > this.scoreBonus) {
        this.scoreBonus = newBonus;
      }
    }
    
    drawHUD() {
      const radius = 50;
      const x = this.CANVAS_WIDTH - 80;
      const y = 80;
      
      // Pie Chart Background
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius, 0, Math.PI*2);
      this.ctx.fillStyle = this.COLORS.pie_bg;
      this.ctx.fill();
      this.ctx.strokeStyle = this.COLORS.pie_border;
      this.ctx.stroke();
      
      // Pie Fill
      const percent = Math.min(1, Math.max(0, this.totalScore / this.trial.target_score));
      if (percent > 0) {
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        // Arc: start at -PI/2 (12 o'clock), end at ...
        this.ctx.arc(x, y, radius, -Math.PI/2, -Math.PI/2 + (Math.PI*2 * percent));
        this.ctx.lineTo(x, y);
        this.ctx.fillStyle = this.COLORS.pie_fill;
        this.ctx.fill();
      }
      
      // Score Text
      this.ctx.fillStyle = 'white';
      this.ctx.font = '20px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(this.totalScore, x, y);
      
      // Label
      this.ctx.font = '14px Arial';
      this.ctx.fillText("目标: " + this.trial.target_score, x, y + radius + 20);
    }

    playSound(key) {
      if (this.loadedAudio[key]) {
        this.loadedAudio[key].currentTime = 0;
        this.loadedAudio[key].play().catch(() => {});
      }
    }

    showFeedback(text, color) {
      if (this.feedbackOverlay) {
        this.feedbackOverlay.innerText = text;
        this.feedbackOverlay.style.color = color;
        this.feedbackOverlay.style.display = 'block';
        this.feedbackOverlay.style.opacity = 1;
        
        // Animate out
        setTimeout(() => {
           this.feedbackOverlay.style.display = 'none';
        }, 800);
      }
    }

    shuffleArray(array) {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
    }
    
    // Cross-trial score ranking using localStorage
    calculateScoreRanking(currentScore) {
      const STORAGE_KEY = 'snake_task_scores';
      
      // Get historical scores from localStorage
      let historicalScores = [];
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          historicalScores = JSON.parse(stored);
        }
      } catch (e) {
        console.warn('Failed to read scores from localStorage:', e);
      }
      
      // Add current score
      historicalScores.push({
        score: currentScore,
        timestamp: Date.now()
      });
      
      // Keep only last 100 scores to avoid storage overflow
      if (historicalScores.length > 100) {
        historicalScores = historicalScores.slice(-100);
      }
      
      // Save back to localStorage
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(historicalScores));
      } catch (e) {
        console.warn('Failed to save scores to localStorage:', e);
      }
      
      // Calculate ranking
      const allScores = historicalScores.map(s => s.score);
      const sortedScores = [...allScores].sort((a, b) => b - a); // Descending
      const topScore = sortedScores[0];
      
      // Find rank of current score
      const rank = sortedScores.indexOf(currentScore) + 1;
      const totalPlayers = sortedScores.length;
      const beatPercent = Math.round((1 - rank / totalPlayers) * 100 * 100) / 100; // Round to 2 decimals
      
      // Generate Python-style message
      const message = `Your score (${currentScore}) beats ${beatPercent}% of players. Top score: ${topScore}. Keep Up!`;
      
      return {
        rank,
        totalPlayers,
        beatPercent,
        topScore,
        message
      };
    }
    
    // Get all historical scores (for external use)
    static getHistoricalScores() {
      const STORAGE_KEY = 'snake_task_scores';
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
      } catch (e) {
        return [];
      }
    }
    
    // Clear historical scores (for admin use)
    static clearHistoricalScores() {
      const STORAGE_KEY = 'snake_task_scores';
      try {
        localStorage.removeItem(STORAGE_KEY);
        return true;
      } catch (e) {
        return false;
      }
    }

    endTrial(reason) {
      // 防止重复调用
      if (this.trialEnded) return;
      this.trialEnded = true;
      
      if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
      document.removeEventListener('keydown', this.keyboardListener);
      
      // Stop background music
      if (this.loadedAudio.background) {
        this.loadedAudio.background.pause();
      }

      // Calculate direction_changes_before_food and nontarget_before_food
      // Python: counts key presses before each food was found
      // 安全检查：确保数组存在且是数组类型
      if (!Array.isArray(this.trialData.time_to_find_food)) {
        this.trialData.time_to_find_food = [];
      }
      if (!Array.isArray(this.trialData.direction_changes_before_food)) {
        this.trialData.direction_changes_before_food = [];
      }
      if (!Array.isArray(this.trialData.nontarget_before_food)) {
        this.trialData.nontarget_before_food = [];
      }
      if (!Array.isArray(this.trialData.reminder_presses_before_food)) {
        this.trialData.reminder_presses_before_food = [];
      }
      if (!Array.isArray(this.trialData.key_presses_time)) {
        this.trialData.key_presses_time = [];
      }
      if (!Array.isArray(this.trialData.time_to_nontarget)) {
        this.trialData.time_to_nontarget = [];
      }
      if (!Array.isArray(this.trialData.reminder_onset)) {
        this.trialData.reminder_onset = [];
      }
      
      const foodCount = this.trialData.food_number;
      for (let i = 0; i < this.trialData.time_to_find_food.length; i++) {
        const foodTime = this.trialData.time_to_find_food[i];
        const prevFoodTime = i > 0 ? this.trialData.time_to_find_food[i - 1] : 0;
        
        // Count key presses in this interval
        let keyPressCount = 0;
        let nontargetCount = 0;
        let reminderCount = 0;
        
        for (const t of this.trialData.key_presses_time) {
          if (i === 0 && t < foodTime) keyPressCount++;
          else if (i > 0 && t > prevFoodTime && t < foodTime) keyPressCount++;
        }
        
        for (const t of this.trialData.time_to_nontarget) {
          if (i === 0 && t < foodTime) nontargetCount++;
          else if (i > 0 && t > prevFoodTime && t < foodTime) nontargetCount++;
        }
        
        for (const t of this.trialData.reminder_onset) {
          if (i === 0 && t < foodTime) reminderCount++;
          else if (i > 0 && t > prevFoodTime && t < foodTime) reminderCount++;
        }
        
        this.trialData.direction_changes_before_food.push(keyPressCount);
        this.trialData.nontarget_before_food.push(nontargetCount);
        this.trialData.reminder_presses_before_food.push(reminderCount);
      }
      
      // Set end_score
      this.trialData.end_score = this.totalScore;
      
      // Convert array fields to JSON strings for CSV compatibility (Python style)
      const arrayFields = [
        'all_locs_xy', 'bush_locs_xy', 'key_presses_time', 'key_presses_direction', 
        'key_presses_key', 'reminder_onset', 'reminder_offset', 'calibration_offset',
        'calibration_onset', 'time_to_find_food', 'time_to_find_food_corrected',
        'food_order', 'initial_optimal_order', 'updated_optimal_order',
        'time_to_nontarget', 'nontarget_order', 'time_to_dist', 'dist_order',
        'eaten_type', 'eaten_position', 'eaten_time',
        'food_locations', 'food_locs_xy', 'apple_locs_xy', 'banana_locs_xy',
        'apple_quadrant', 'banana_quadrant', 'special_food_loc', 'special_food_locs_xy',
        'direction_changes_before_food', 'direction_changes_before_food_corrected',
        'reminder_presses_before_food', 'nontarget_before_food',
        'snake_pos', 'gaze_pos', 'time', 'frozen_snake', 'frozen_time', 'gaze_pos_all'
      ];
      
      for (const field of arrayFields) {
        if (Array.isArray(this.trialData[field])) {
          this.trialData[field] = JSON.stringify(this.trialData[field]);
        }
      }
      
      // Calculate ranking using localStorage (Python style)
      const rankingResult = this.calculateScoreRanking(this.totalScore);
      const feedbackMsg = rankingResult.message;
      
      // Store ranking data
      this.trialData.score = this.score;
      this.trialData.rt = performance.now() - this.trialStartTime;
      this.trialData.termination_reason = reason;
      this.trialData.rank = rankingResult.rank;
      this.trialData.beat_percent = rankingResult.beatPercent;
      this.trialData.top_score = rankingResult.topScore;
      
      // 导出蛇的位置和方向，供下一试次继承
      this.trialData.final_snake_position = JSON.stringify(this.snake);
      this.trialData.final_snake_direction = this.direction;
      this.trialData.final_snake_length = this.snake.length;
      this.trialData.score_bonus = this.scoreBonus;
      
      // 辅助函数：完成试次并更新全局状态
      const finishTrialAndUpdateState = () => {
        // 删除不需要的字段（stimulus 包含大量HTML，不需要保存到CSV）
        delete this.trialData.stimulus;
        
        // 在 finishTrial 之前更新全局状态（解决时序问题）
        // 因为 on_finish 回调执行时下一个试次可能已经开始了
        if (typeof window.globalSnakeState !== 'undefined') {
          // 撞墙结束时，下一轮蛇位置重置到屏幕中央；撞自己则保留蛇长度
          if (reason === 'wall_collision' || reason === 'crash') {
            window.globalSnakeState.position = null; // 重置到中央
            window.globalSnakeState.direction = 'RIGHT'; // 重置方向
          } else {
            window.globalSnakeState.position = [...this.snake];
            window.globalSnakeState.direction = this.direction;
          }
          // 分数始终保留累计
          window.globalSnakeState.totalScore = this.totalScore;
          console.log('[DEBUG] Updated global state BEFORE finishTrial:', window.globalSnakeState, 'reason:', reason);
        }
        
        this.jsPsych.finishTrial(this.trialData);
      };
      
      // 参考 template.py：所有情况（吃完食物、撞墙等）都直接进入下一轮，不显示总分画面
      // 直接调用 finishTrial，不显示结束画面
      finishTrialAndUpdateState();
    }
  }

  class SnakeTaskPlugin {
    constructor(jsPsych) {
      this.jsPsych = jsPsych;
    }

    trial(display_element, trial) {
      const trialInstance = new Trial(this.jsPsych, display_element, trial);
      trialInstance.start();
    }
  }

  SnakeTaskPlugin.info = info;
  
  // Expose static methods for external access
  SnakeTaskPlugin.getHistoricalScores = function() {
    const STORAGE_KEY = 'snake_task_scores';
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  };
  
  SnakeTaskPlugin.clearHistoricalScores = function() {
    const STORAGE_KEY = 'snake_task_scores';
    try {
      localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch (e) {
      return false;
    }
  };

  return SnakeTaskPlugin;

})(jsPsychModule);
