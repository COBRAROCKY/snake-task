# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Repository overview

This project implements a cognitive "Snake" game task in two forms:

- A **desktop Python/pygame version** in `template.py`, designed for lab use with optional EEG, eye tracking, and joystick integration.
- A **web-based jsPsych version** in the `snake_jspsych/` directory, suitable for running the task in a browser and exporting CSV data.

Most of the experimental logic (trial structure, scoring rules, distractors, data logging) is mirrored between these two implementations.

## Common commands

### Python environment

From the repository root:

```bash
pip install -r requirements.txt
```

This installs the core dependencies used by the Python implementation (`pygame`, `numpy`, `pandas`, `pyserial`).

### Run the desktop (pygame) experiment

From the repository root:

```bash
python template.py
```

Notes:
- The script prompts for `Subject ID` on startup and creates a folder `sub_<ID>/` to store trial CSV files.
- Audio (`audios/*.mp3`) and image assets (`draws/*.png`) are loaded relative to the script. Ensure those folders are present when running.
- EEG, eye tracking, and joystick support are controlled by the flags at the top of `template.py`:
  - `EEG_on`, `EYETRACKING_on`, `EYETRACKING_practice`, `JOY_STICK`.
  - When `EEG_on` is `1`, the code opens a serial port on `COM4` and writes trigger bytes.
  - When `EYETRACKING_on` is `1`, the code connects to Gazepoint on `127.0.0.1:4242` and streams gaze data.

### Run the web/jsPsych experiment locally

The web task must be served over HTTP; do not open `index.html` directly from disk.

Using Python (recommended):

```bash
cd snake_jspsych
python -m http.server 8000
# Then open http://localhost:8000 in a browser
```

Using Node.js `http-server` (if installed globally):

```bash
cd snake_jspsych
http-server -p 8000
# Then open http://localhost:8000 in a browser
```

In VS Code, you can also run via the **Live Server** extension by opening `snake_jspsych/index.html` with Live Server.

### Analyze exported web CSV data

The jsPsych experiment downloads CSV files named like `snake_<subject_id>_<timestamp>.csv`. To run the built-in analysis pipeline:

1. Place the CSV files under `snake_jspsych/data/`.
2. From the repository root or from within `snake_jspsych/`:

```bash
cd snake_jspsych
python parse.py
```

This script will:
- Load and parse all non-summary/non-parsed CSV files in `snake_jspsych/data/`.
- Perform data validation and consistency checks.
- Print a detailed analysis report to the console.
- Write summary CSVs (`summary_*.csv`), validation reports (`validation_*.txt`), and parsed Excel files (`parsed_*.xlsx`) back into `snake_jspsych/data/`.

## High-level architecture

### 1. Python/pygame implementation (`template.py`)

**Purpose:** Runs the lab version of the task with rich instrumentation (EEG triggers, eye tracking, joystick), precise timing, and detailed per-trial logging.

**Key structures and flow:**

- **Global configuration and device flags**
  - At the top of `template.py` the script defines global flags and constants:
    - Device toggles: `EEG_on`, `EYETRACKING_on`, `EYETRACKING_practice`, `JOY_STICK`.
    - Screen geometry and display constants (`screen_w`, `screen_h`, `PIE_RADIUS`, etc.).
    - Game parameters (`BLOCK_SIZE`, `scale_factor`, `SPEED`, `SET_SIZE`, `FOOD_T`, `FROZEN_T`, `LOC_N`, etc.).
  - When EEG/eye-tracking flags are enabled, the script initializes the corresponding devices and sockets before starting the game loop.

- **Gaze utilities (optional)**
  - `normalize_gaze_to_screen`, `get_gaze_data`, and `show_gaze` convert raw Gazepoint coordinates into screen coordinates and are used throughout trial phases to append gaze samples to the current trial.
  - `collect_gaze_data` runs in a separate thread when enabled, pushing gaze samples into a `Queue` for asynchronous logging.

- **Scoring and ranking helpers**
  - `read_score(directory_path, score)` scans all CSVs in `sub_<ID>/` to compute the accumulated score across attempts and to build the "Score / Total Score" display string.
  - `rank_current_score(score, working_dir)` walks all `sub_*` folders under the working directory, extracts `end_score` from each CSV, ranks the current score, and returns a message such as "Your score(X) beats Y% of players" for the end screen.

- **Grid and target layout logic**
  - `calculate_centered_grid_points(display_width, display_height, num_rows, num_cols)` generates a 5×7 grid centered in the display, snapped to the movement grid (`BLOCK_SIZE`).
  - `get_quadrant_points(points, num_rows, num_cols)` splits grid locations into four quadrants, excluding the central row and column, mirroring the design described in `snake_jspsych/README.md`.
  - `select_random_points(quadrants, num_points)` returns three sets of points:
    - `all_points`: jittered grid points across all quadrants.
    - `selected_points`: candidate bush/food locations.
    - `nonselected_points`: unused locations.
  - `calculate_distance` and `jitter_point` ensure that food/bush locations are spaced sufficiently far apart while staying on-grid.

- **`SnakeGame` class**

  This is the core class encapsulating the pygame task logic:

  - **Initialization (`__init__`)**
    - Sets up the display (`pygame.display.set_mode`), clock, fonts, and audio assets.
    - Loads and scales sprite images from `draws/` (snake head, body, apples, grapes, bushes, apple core).
    - Creates the initial snake body (3 segments), sets initial direction, score, total score, and target score.
    - Initializes trial state (`self.current_trial`), mirroring the rich CSV structure used later for analysis.
    - Shows a short experimenter control screen (`show_exp_control_screen`) and a participant welcome/break screen (`show_welcome_screen`), then calls `_place_food()` to start the first trial.

  - **Trial lifecycle**

    The core trial phases match the jsPsych version:
    1. **Food presentation (`_place_food` + `_show_food`)**
       - Uses the quadrant/grid utilities to generate candidate locations and to pick 1–2 target foods away from the current snake quadrant.
       - Optionally places a special distractor food (grapes) based on `special_food_T` and the number of targets.
       - Logs location indices, coordinates, quadrants, and timing into `self.current_trial`.
       - Plays a cue sound and freezes keyboard input while foods are visible.
    2. **Frozen crosshair window (`frozen_window`)**
       - Hides foods, draws a cross at the snake head, freezes controls, and shows a shrinking circle as a countdown.
       - Continues logging snake position, time, and optionally gaze samples.
       - Resumes movement and logging when the freeze ends.
    3. **Movement and search (`play_step`, `_update_ui`)**
       - Handles input from keyboard and optional joystick, enforcing no 180° direction reversals.
       - Implements reminder (`S`) and calibration (`O`) behavior, including scoring penalties and EEG triggers when enabled.
       - Updates the snake’s position, checks collisions, and handles scoring for:
         - Correct targets (apples/bananas): positive score, fireworks animation, progression to next trial.
         - Wrong bush locations: negative score, temporary freeze with visual feedback, and detailed logging of non-target events.
         - Special food (grapes): bonus points, optional frozen window, and logging of distractor-specific metrics.
       - On trial completion (all targets eaten) or crash, assembles derived metrics into `self.current_trial` (direction changes, reminders, non-target behavior) and appends it to the global `trials_data` list.

  - **Game over handling and persistence**
    - When the snake crashes, `play_step` determines whether the participant should restart or finish based on `subject_id` and accumulated `total_score`.
    - `save_data_to_csv` writes all accumulated `trials_data` for an attempt into `sub_<ID>/sub_<ID>_game_<attempt>.csv` (one row per trial), with columns matching those expected by the web-version analysis (`snake_jspsych/parse.py`).

  - **Visual feedback utilities**
    - `draw_pie_chart` renders a score pie chart at the top of the screen based on `self.total_score` and `self.target_score`.
    - `snake_dance` plays a short celebratory movement pattern when all foods in a trial are collected.
    - `_update_ui` contains the main drawing routine for the snake, bushes, fruits, special food, feedback overlays, and score change indicators.

- **Top-level loop**
  - The `if __name__ == '__main__':` block instantiates `SnakeGame` and repeatedly calls `play_step()` until `game_over` is `True`, at which point it saves data and quits pygame.

### 2. Web/jsPsych implementation (`snake_jspsych/`)

The web implementation closely mirrors the Python one but is decomposed into three main parts: experiment orchestration (`main.js`), a custom jsPsych plugin for the game (`plugins/jspsych-snake-task-v2.js`), and downstream data analysis (`parse.py`).

#### 2.1 Experiment orchestration (`snake_jspsych/main.js`)

**Responsibilities:**

- Initialize jsPsych and configure the overall experiment flow.
- Manage subject metadata, mode selection (practice vs experiment), and stopping conditions.
- Ensure that exported CSV columns and formats match the Python version for downstream analysis.

**Key pieces:**

- **Global state and jsPsych initialization**
  - `subject_id` and `gameMode` (`'experiment'` or `'practice'`).
  - `window.globalSnakeState` keeps the snake’s final position, direction, and cumulative score across trials so each new trial can start from where the previous one ended.
  - `initJsPsych({ on_finish(...) { ... } })` collects all `snake-task` trials, filters for completed ones, and generates a CSV whose columns (`pythonFields`) match the Python-generated CSV order.

- **Python-compatible CSV export**
  - The `pythonFields` array enumerates all expected columns: from `trial_onset`, `food_presentation_end` through to `gaze_pos_all`.
  - `formatPythonValue` converts values into strings resembling Python’s `str()` formatting:
    - Arrays of coordinates become `[(x, y), ...]`.
    - Arrays of primitive values get Python-style single-quoted strings where appropriate.
    - Objects with `{x, y}` become `(x, y)`.
  - The script builds `csvContent` row by row in field order, applies necessary CSV escaping, and triggers a browser download named `snake_<subject_id>_<timestamp>.csv`.

- **UI flows and instructions**
  - `mode_selection` (jsPsychHtmlButtonResponse): stylized screen to choose practice vs experiment mode.
  - `welcome` and `instructions` (jsPsychHtmlKeyboardResponse): present detailed experimental instructions and key mappings (e.g., reminder key, quit key, freeze behavior).
  - `subject_id_trial` (jsPsychSurveyText): collects `subject_id` and calls `jsPsych.data.addProperties` to attach metadata (`subject_id`, `experiment_name`, `experiment_version`) to all subsequent trials.

- **Trial configuration and looping**
  - `practice_trial`: a simplified `jsPsychSnakeTask` trial (longer show-food time, single target, 30s duration) with its own `trial_type: 'practice'` in the data field.
  - `snake_trial`: the main experimental trial type, parameterized to:
    - Respect a global time limit (`MAX_TIME_MS`) across all trials.
    - Use `initial_snake_position`, `initial_snake_direction`, and `current_total_score` callbacks to pull prior state from `window.globalSnakeState`.
    - Add `trial_number` (based on count of `snake-task` trials) in `on_finish`.
  - `game_loop`: a jsPsych timeline node that loops `snake_trial` until:
    - Practice-mode trial count reaches `PRACTICE_MAX_TRIALS`.
    - Global elapsed time exceeds `MAX_TIME_MS` (experiment mode).
    - The plugin signals termination (quit/manual quit/goal reached) or `globalSnakeState.totalScore >= GOAL_SCORE`.

- **Completion flows**
  - `thank_you`: final keyboard response trial that prompts the participant to download data and then proceeds to the `on_finish` export logic.
  - `displayCompletionMessage` and `displayPracticeEndMessage`: replace the document body with a styled completion/practice-end summary, including basic statistics like trial count, average score, and total time.

#### 2.2 Snake game plugin (`snake_jspsych/plugins/jspsych-snake-task-v2.js`)

**Purpose:** Implements the full browser-based version of the Snake task, closely following the Python `SnakeGame` design, including:

- Three trial phases (show food → freeze → move).
- Quadrant-based food and distractor placement on a jittered 5×7 grid.
- Visual assets (images and audio) matching the pygame version.
- Rich per-trial logging structure compatible with Python CSVs.

**Design highlights:**

- **Plugin metadata (`info`)**
  - Declares parameters like `trial_duration`, `show_food_duration`, `freeze_duration`, `grid_size`, `canvas_width`, `canvas_height`, `num_foods`, `target_score`, `current_total_score`, `initial_snake_position`, `initial_snake_direction`, `grape_time_limit`, and several visual scale parameters (`body_size`, `head_size`, `bush_size`, `apple_size`).
  - These parameters allow the host script (`main.js`) or external configuration to tune trial behavior without changing plugin internals.

- **Trial class state**
  - Internal fields mirror the Python implementation:
    - Grid constants and image/audio paths (`draws/*.png`, `audios/*.mp3`).
    - Bush and grid management (`NUM_BUSHES_PER_QUADRANT`, `TOTAL_BUSHES`, `allGridPoints`, `bushLocations`).
    - Rich `trialData` object with all fields that appear in Python CSVs (e.g., `food_locs_xy`, `direction_changes_before_food`, `time_to_dist`, `nontarget_before_food`, etc.).
    - Enhanced gameplay features: wrong-location freezing, multiple grapes as distractors, score multipliers, score-change overlays, pause handling, and crash flags.

- **Lifecycle methods**
  - `start()`: loads assets, initializes the display (full-window canvas plus a bottom bar), sets up keyboard handlers, and transitions into the game loop.
  - `loadAssets()`: asynchronously loads all images and audio, with graceful fallbacks if some files are missing.
  - `initGame()`: sets up the snake’s initial position (using `initial_snake_position` and `initial_snake_direction` if provided) and populates grid/bush/food locations.
  - The main loop advances phases (`show_food`, `freeze`, `move`) according to the configured durations, updates snake motion when not frozen, processes collisions, and records all necessary timing and position data.
  - At the end of a trial, it packages `trialData`, sets `end_score`, and returns control to jsPsych, which then updates `window.globalSnakeState` (in `main.js`).

- **Visual and timing behavior**
  - Draws background, bushes, snake body/head, targets, grapes, pie chart progress, and dynamic feedback (e.g., score deltas near the snake head).
  - Mimics the Python freeze crosshair window with a shrinking circular marker during the freeze phase.
  - Uses timestamps (`performance.now()`) to drive phase transitions and to stamp events (food eaten, errors, special food onset/offset) for later analysis.

**Tuning parameters:**

For visual and gameplay tweaks, prefer editing `snake_jspsych/PARAMETERS.md`, which documents
where to change key parameters inside `jspsych-snake-task-v2.js` (file paths and approximate line numbers), including:

- Spacing between bushes (`minSpacing`).
- Snake speed (`SPEED`).
- Number of bushes per quadrant (`NUM_BUSHES_PER_QUADRANT`).
- Canvas size and grid size.
- Relative sizes of snake head/body, bushes, apples/grapes, and center exclusion region (no-food zone).

#### 2.3 Legacy/simple plugin (`snake_jspsych/plugins/jspsych-snake-task.js`)

This earlier plugin provides a simplified Snake task:

- Pure canvas rendering without images or audio.
- Simpler trial data structure (score, snake path, key presses, errors) and basic three-phase logic.
- Relaxed placement rules (no quadrant/distractor logic beyond a simple 5×7 grid in the center).

The `main.js` currently uses `jsPsychSnakeTask` from `jspsych-snake-task-v2.js`, so the legacy plugin mainly serves as a reference for a minimal implementation.

#### 2.4 Web README and data flow (`snake_jspsych/README.md` and `parse.py`)

- `snake_jspsych/README.md` documents the experimental design and data columns at a conceptual level, closely aligned with the Python version:
  - Trial phases, food generation rules, scoring, and what is omitted in the web version (EEG, eye tracking, joystick, complex optimal-path analysis, global ranking).
  - How to run the experiment locally (HTTP server), deploy it, or embed it in online platforms.
  - The expected CSV fields (e.g., `subject_id`, `trial_number`, `score`, `food_positions`, `special_food_position`, `snake_path`, `key_presses`, `phase_transitions`, `eaten_foods`, `errors`, `rt`, `game_over`, `foods_remaining`).

- `snake_jspsych/parse.py` is the canonical script for validating and analyzing web CSVs:
  - **Parsing:** `load_and_parse_csv` reads a CSV and converts stringified JSON/Python-like lists into Python objects using `json.loads` / `ast.literal_eval` for many key fields (snake positions, food coordinates, timing lists, etc.).
  - **Standard alignment:** `compare_with_standard` optionally compares a dataset against a "standard" Python CSV to check for column presence, order, and formatting differences.
  - **Data validation:** `validate_trial_data` enforces basic quality constraints (minimum snake trajectory length, non-empty `time_to_find_food` where appropriate, consistent timing relationships, and distractor-related sanity checks).
  - **Analysis report:** `analyze_data` prints a structured report covering basic demographics (subject, version), score statistics, time-on-task, termination reasons, search performance, distractor performance, error counts, reminder usage, and movement statistics.
  - **Outputs:** `save_summary` writes a single-row summary CSV per input file; additional text reports and parsed Excel files are created in the same `data/` folder.

### 3. Coordination between Python and web implementations

- The Python game (`template.py`) and the web plugin (`jspsych-snake-task-v2.js`) are intentionally aligned:
  - Both use a 5×7 grid with jittered locations, quadrant-based food logic, and optional distractors.
  - Both implement three trial phases, similar scoring (+1 targets, −1 wrong locations, +3 distractor, crashes end the game), and per-trial metrics (time to find food, direction changes, reminders, non-target behavior).
  - CSV columns produced by the web exporter are ordered and named to match those in the Python-generated `sub_<ID>_game_<attempt>.csv` files, making it possible to analyze both sources with the same downstream logic.

When extending or refactoring either implementation, prefer keeping these shared concepts synchronized so that analysis scripts and experimental expectations remain valid across both desktop and web versions.
