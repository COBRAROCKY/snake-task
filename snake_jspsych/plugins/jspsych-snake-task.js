/**
 * jspsych-snake-task
 * 
 * A custom jsPsych plugin for a snake-based cognitive task
 * Adapted from Python pygame implementation
 * 
 * @author Your Name
 * @version 1.0.0
 */

const jsPsychSnakeTask = (function (jspsych) {
  'use strict';

  const info = {
    name: 'snake-task',
    parameters: {
      trial_duration: {
        type: jspsych.ParameterType.INT,
        pretty_name: 'Trial duration',
        default: 60000, // 60 seconds max per trial
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
      canvas_width: {
        type: jspsych.ParameterType.INT,
        pretty_name: 'Canvas width',
        default: 1000,
        description: 'Width of the canvas'
      },
      canvas_height: {
        type: jspsych.ParameterType.INT,
        pretty_name: 'Canvas height',
        default: 700,
        description: 'Height of the canvas'
      },
      num_foods: {
        type: jspsych.ParameterType.INT,
        pretty_name: 'Number of foods',
        default: null, // null means random (1 or 2)
        description: 'Number of target foods (1-2, null for random)'
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
      this.COLS = Math.floor(this.CANVAS_WIDTH / this.GRID_SIZE);
      this.ROWS = Math.floor(this.CANVAS_HEIGHT / this.GRID_SIZE);
      
      // Colors
      this.COLORS = {
        background: '#3c3c3c',
        snake_head: '#4BB3FD',
        snake_body: '#4BB3FD',
        food_target: '#FF4444',
        food_special: '#FFD700',
        bush: '#2d5016',
        freeze_marker: '#4BB3FD',
        text_positive: '#00FF00',
        text_negative: '#FF0000',
        white: '#FFFFFF'
      };
      
      // Game state
      this.phase = 'show_food'; // 'show_food', 'freeze', 'move'
      this.direction = 'RIGHT';
      this.snake = [];
      this.targetFoods = [];
      this.specialFood = null;
      this.bushLocations = [];
      this.allLocations = [];
      this.score = 0;
      this.gameOver = false;
      
      // Timing
      this.trialStartTime = null;
      this.phaseStartTime = null;
      this.specialFoodTimer = null;
      this.freezeTimer = null;
      
      // Data collection
      this.trialData = {
        score: 0,
        food_positions: [],
        special_food_position: null,
        snake_path: [],
        key_presses: [],
        phase_transitions: [],
        eaten_foods: [],
        errors: [],
        rt: null
      };
      
      // Animation
      this.animationFrameId = null;
      this.lastFrameTime = 0;
      this.frameInterval = 1000 / this.SPEED;
      
      // Special food flag
      this.hasSpecialFood = false;
      this.specialFoodActive = false;
    }

    start() {
      // Create canvas
      this.display_element.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; background-color: #2c2c2c;">
          <div style="margin-bottom: 20px; color: white; font-size: 24px; font-weight: bold;">
            Score: <span id="score-display">0</span>
          </div>
          <canvas id="snake-canvas" width="${this.CANVAS_WIDTH}" height="${this.CANVAS_HEIGHT}" 
            style="border: 3px solid #555; background-color: ${this.COLORS.background};">
          </canvas>
          <div id="feedback-text" style="margin-top: 20px; color: white; font-size: 20px; height: 30px;"></div>
        </div>
      `;
      
      this.canvas = this.display_element.querySelector('#snake-canvas');
      this.ctx = this.canvas.getContext('2d');
      this.scoreDisplay = this.display_element.querySelector('#score-display');
      this.feedbackText = this.display_element.querySelector('#feedback-text');
      
      // Initialize game
      this.initializeGame();
      
      // Set up keyboard listener
      this.keyboardListener = (e) => this.handleKeyPress(e);
      document.addEventListener('keydown', this.keyboardListener);
      
      // Start trial
      this.trialStartTime = performance.now();
      this.phaseStartTime = this.trialStartTime;
      this.trialData.phase_transitions.push({
        phase: 'show_food',
        time: 0
      });
      
      // Start game loop
      this.gameLoop();
    }

    initializeGame() {
      // Initialize snake at center
      const centerX = Math.floor(this.COLS / 2) * this.GRID_SIZE;
      const centerY = Math.floor(this.ROWS / 2) * this.GRID_SIZE;
      
      this.snake = [
        { x: centerX, y: centerY },
        { x: centerX - this.GRID_SIZE, y: centerY },
        { x: centerX - 2 * this.GRID_SIZE, y: centerY }
      ];
      
      // Generate grid locations (5x7 grid in the center)
      this.generateLocations();
      
      // Place foods
      this.placeFoods();
    }

    generateLocations() {
      const NUM_ROWS = 5;
      const NUM_COLS = 7;
      
      // Calculate grid dimensions
      const gridWidth = (this.CANVAS_WIDTH * 2 / 3);
      const gridHeight = (this.CANVAS_HEIGHT * 2 / 3);
      const cellWidth = gridWidth / NUM_COLS;
      const cellHeight = gridHeight / NUM_ROWS;
      
      // Calculate starting position to center the grid
      const startX = (this.CANVAS_WIDTH - gridWidth) / 2;
      const startY = (this.CANVAS_HEIGHT - gridHeight) / 2;
      
      this.allLocations = [];
      this.bushLocations = [];
      
      for (let row = 0; row < NUM_ROWS; row++) {
        for (let col = 0; col < NUM_COLS; col++) {
          const x = Math.floor((startX + col * cellWidth) / this.GRID_SIZE) * this.GRID_SIZE;
          const y = Math.floor((startY + row * cellHeight) / this.GRID_SIZE) * this.GRID_SIZE;
          
          const loc = { x, y };
          this.allLocations.push(loc);
          
          // Check if not occupied by snake
          if (!this.isOccupiedBySnake(loc)) {
            this.bushLocations.push(loc);
          }
        }
      }
    }

    placeFoods() {
      // Determine number of foods
      let numFoods = this.trial.num_foods;
      if (numFoods === null) {
        numFoods = Math.random() < 0.33 ? 1 : 2;
      }
      
      // Get available positions (not occupied by snake)
      const availablePositions = this.bushLocations.filter(loc => 
        !this.isOccupiedBySnake(loc)
      );
      
      // Randomly select food positions
      this.targetFoods = [];
      for (let i = 0; i < numFoods && availablePositions.length > 0; i++) {
        const randomIndex = Math.floor(Math.random() * availablePositions.length);
        const foodPos = availablePositions.splice(randomIndex, 1)[0];
        this.targetFoods.push({ ...foodPos });
        this.trialData.food_positions.push({ ...foodPos });
      }
      
      // 50% chance to add special food
      if (Math.random() < 0.5 && availablePositions.length > 0) {
        const randomIndex = Math.floor(Math.random() * availablePositions.length);
        this.specialFood = availablePositions[randomIndex];
        this.hasSpecialFood = true;
        this.trialData.special_food_position = { ...this.specialFood };
      }
    }

    isOccupiedBySnake(pos) {
      return this.snake.some(segment => 
        segment.x === pos.x && segment.y === pos.y
      );
    }

    handleKeyPress(e) {
      // Only process arrow keys during move phase
      if (this.phase !== 'move') return;
      
      const key = e.key;
      let newDirection = null;
      
      // Prevent default arrow key behavior (scrolling)
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
        e.preventDefault();
      }
      
      switch (key) {
        case 'ArrowLeft':
          if (this.direction !== 'RIGHT') newDirection = 'LEFT';
          break;
        case 'ArrowRight':
          if (this.direction !== 'LEFT') newDirection = 'RIGHT';
          break;
        case 'ArrowUp':
          if (this.direction !== 'DOWN') newDirection = 'UP';
          break;
        case 'ArrowDown':
          if (this.direction !== 'UP') newDirection = 'DOWN';
          break;
      }
      
      if (newDirection) {
        this.direction = newDirection;
        this.trialData.key_presses.push({
          key: key,
          direction: newDirection,
          time: performance.now() - this.trialStartTime
        });
      }
    }

    gameLoop(timestamp = 0) {
      // Check trial timeout
      const currentTime = performance.now();
      if (currentTime - this.trialStartTime > this.trial.trial_duration) {
        this.endTrial();
        return;
      }
      
      // Frame rate control
      const deltaTime = timestamp - this.lastFrameTime;
      
      if (deltaTime >= this.frameInterval) {
        this.lastFrameTime = timestamp;
        
        // Update phase
        this.updatePhase();
        
        // Update game state
        if (this.phase === 'move') {
          this.updateSnake();
          this.checkCollisions();
        }
        
        // Record snake position
        this.trialData.snake_path.push({
          x: this.snake[0].x,
          y: this.snake[0].y,
          time: currentTime - this.trialStartTime
        });
        
        // Render
        this.render();
        
        // Check if trial should end
        if (this.gameOver || this.targetFoods.length === 0) {
          setTimeout(() => this.endTrial(), 1000); // 1 second delay
          return;
        }
      }
      
      // Continue loop
      this.animationFrameId = requestAnimationFrame((t) => this.gameLoop(t));
    }

    updatePhase() {
      const currentTime = performance.now();
      const phaseElapsed = currentTime - this.phaseStartTime;
      
      if (this.phase === 'show_food') {
        if (phaseElapsed >= this.trial.show_food_duration) {
          this.phase = 'freeze';
          this.phaseStartTime = currentTime;
          this.trialData.phase_transitions.push({
            phase: 'freeze',
            time: currentTime - this.trialStartTime
          });
        }
      } else if (this.phase === 'freeze') {
        if (phaseElapsed >= this.trial.freeze_duration) {
          this.phase = 'move';
          this.phaseStartTime = currentTime;
          this.trialData.phase_transitions.push({
            phase: 'move',
            time: currentTime - this.trialStartTime
          });
          
          // Activate special food if exists
          if (this.hasSpecialFood && !this.specialFoodActive) {
            this.specialFoodActive = true;
            this.specialFoodTimer = currentTime;
          }
        }
      }
    }

    updateSnake() {
      // Calculate new head position
      const head = { ...this.snake[0] };
      
      switch (this.direction) {
        case 'UP':
          head.y -= this.GRID_SIZE;
          break;
        case 'DOWN':
          head.y += this.GRID_SIZE;
          break;
        case 'LEFT':
          head.x -= this.GRID_SIZE;
          break;
        case 'RIGHT':
          head.x += this.GRID_SIZE;
          break;
      }
      
      // Add new head
      this.snake.unshift(head);
      
      // Remove tail (snake doesn't grow in this version)
      this.snake.pop();
    }

    checkCollisions() {
      const head = this.snake[0];
      
      // Check wall collision
      if (head.x < 0 || head.x >= this.CANVAS_WIDTH || 
          head.y < 0 || head.y >= this.CANVAS_HEIGHT) {
        this.gameOver = true;
        this.showFeedback('Game Over! Hit wall', 'negative');
        return;
      }
      
      // Check self collision
      for (let i = 1; i < this.snake.length; i++) {
        if (head.x === this.snake[i].x && head.y === this.snake[i].y) {
          this.gameOver = true;
          this.showFeedback('Game Over! Hit self', 'negative');
          return;
        }
      }
      
      // Check food collision
      const targetFoodIndex = this.targetFoods.findIndex(food => 
        food.x === head.x && food.y === head.y
      );
      
      if (targetFoodIndex !== -1) {
        // Ate target food
        this.score += 1;
        this.scoreDisplay.textContent = this.score;
        this.showFeedback('+1', 'positive');
        
        const eatenFood = this.targetFoods.splice(targetFoodIndex, 1)[0];
        this.trialData.eaten_foods.push({
          position: eatenFood,
          time: performance.now() - this.trialStartTime,
          type: 'target'
        });
        
        // Deactivate special food when target is eaten
        this.specialFoodActive = false;
        
        return;
      }
      
      // Check special food collision
      if (this.specialFoodActive && this.specialFood && 
          head.x === this.specialFood.x && head.y === this.specialFood.y) {
        this.score += 3;
        this.scoreDisplay.textContent = this.score;
        this.showFeedback('+3', 'positive');
        
        this.trialData.eaten_foods.push({
          position: { ...this.specialFood },
          time: performance.now() - this.trialStartTime,
          type: 'special'
        });
        
        this.specialFood = null;
        this.specialFoodActive = false;
        
        return;
      }
      
      // Check bush collision (wrong location)
      const isBushLocation = this.bushLocations.some(bush => 
        bush.x === head.x && bush.y === head.y
      );
      
      if (isBushLocation && !this.targetFoods.some(f => f.x === head.x && f.y === head.y)) {
        this.score -= 1;
        this.scoreDisplay.textContent = this.score;
        this.showFeedback('-1', 'negative');
        
        this.trialData.errors.push({
          position: { x: head.x, y: head.y },
          time: performance.now() - this.trialStartTime
        });
      }
    }

    showFeedback(text, type) {
      if (this.feedbackText) {
        this.feedbackText.textContent = text;
        this.feedbackText.style.color = type === 'positive' ? 
          this.COLORS.text_positive : this.COLORS.text_negative;
        
        setTimeout(() => {
          if (this.feedbackText) {
            this.feedbackText.textContent = '';
          }
        }, 1000);
      }
    }

    render() {
      // Clear canvas
      this.ctx.fillStyle = this.COLORS.background;
      this.ctx.fillRect(0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);
      
      // Draw bushes (in all phases)
      this.ctx.fillStyle = this.COLORS.bush;
      for (const bush of this.bushLocations) {
        this.ctx.fillRect(bush.x + 5, bush.y + 5, this.GRID_SIZE - 10, this.GRID_SIZE - 10);
      }
      
      // Draw foods (only in show_food phase)
      if (this.phase === 'show_food') {
        this.ctx.fillStyle = this.COLORS.food_target;
        for (const food of this.targetFoods) {
          this.ctx.beginPath();
          this.ctx.arc(
            food.x + this.GRID_SIZE / 2,
            food.y + this.GRID_SIZE / 2,
            this.GRID_SIZE / 2 - 5,
            0,
            Math.PI * 2
          );
          this.ctx.fill();
        }
      }
      
      // Draw snake (in all phases except freeze)
      if (this.phase !== 'freeze') {
        // Draw body
        this.ctx.fillStyle = this.COLORS.snake_body;
        for (let i = 1; i < this.snake.length; i++) {
          const segment = this.snake[i];
          this.ctx.fillRect(
            segment.x + this.GRID_SIZE / 4,
            segment.y + this.GRID_SIZE / 4,
            this.GRID_SIZE / 2,
            this.GRID_SIZE / 2
          );
        }
        
        // Draw head
        this.ctx.fillStyle = this.COLORS.snake_head;
        const head = this.snake[0];
        this.ctx.fillRect(
          head.x + 2,
          head.y + 2,
          this.GRID_SIZE - 4,
          this.GRID_SIZE - 4
        );
      }
      
      // Draw freeze marker (only in freeze phase)
      if (this.phase === 'freeze') {
        const head = this.snake[0];
        const centerX = head.x + this.GRID_SIZE / 2;
        const centerY = head.y + this.GRID_SIZE / 2;
        
        // Calculate shrinking radius
        const elapsed = performance.now() - this.phaseStartTime;
        const progress = elapsed / this.trial.freeze_duration;
        const maxRadius = this.GRID_SIZE * 1.5;
        const currentRadius = maxRadius * (1 - progress);
        
        this.ctx.strokeStyle = this.COLORS.freeze_marker;
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
        this.ctx.stroke();
      }
      
      // Draw special food (only in move phase if active)
      if (this.phase === 'move' && this.specialFoodActive && this.specialFood) {
        this.ctx.fillStyle = this.COLORS.food_special;
        this.ctx.beginPath();
        this.ctx.arc(
          this.specialFood.x + this.GRID_SIZE / 2,
          this.specialFood.y + this.GRID_SIZE / 2,
          this.GRID_SIZE / 2 - 3,
          0,
          Math.PI * 2
        );
        this.ctx.fill();
      }
    }

    endTrial() {
      // Stop animation
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
      }
      
      // Remove keyboard listener
      document.removeEventListener('keydown', this.keyboardListener);
      
      // Finalize data
      this.trialData.score = this.score;
      this.trialData.rt = performance.now() - this.trialStartTime;
      this.trialData.game_over = this.gameOver;
      this.trialData.foods_remaining = this.targetFoods.length;
      
      // End trial
      this.jsPsych.finishTrial(this.trialData);
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

  return SnakeTaskPlugin;

})(jsPsychModule);
