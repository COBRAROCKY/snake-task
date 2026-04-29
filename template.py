import pygame
import random
from enum import Enum
from collections import namedtuple
import math
import csv
import numpy as np
import os
import pandas as pd
import threading
from queue import Queue
import time

# eeg and eye tracking recording
EEG_on = 0
EYETRACKING_on = 0
EYETRACKING_practice = 0
JOY_STICK = 0


gaze_on = 0
trial_start = None

# for scroe display
screen_w = 1920
screen_h = 1040#1040
center_x, center_y = screen_w // 2, screen_h // 2
cross_length = 20  # Length of each arm of the cross
cross_thickness = 5  # Thickness of the cross lines

PIE_RADIUS = 60  # Radius of the pie chart
PIE_X = int(screen_w / 2)  # Center of the pie chart
PIE_Y = 100  # Vertical position of the pie chart
working_dir = os.path.dirname(os.path.abspath(__file__))

pygame.init()
# font = pygame.font.Font('arial.ttf', 30)
font = pygame.font.SysFont('arial', 30)
pygame.mixer.init()
pygame.mixer.music.load('audios/background.mp3')
pygame.mixer.music.play(-1)  # Start playing the background music on loop

eat_sound = pygame.mixer.Sound('audios/food.mp3')
error_sound = pygame.mixer.Sound('audios/error.mp3')
grapes_sound = pygame.mixer.Sound('audios/grapes_eat.mp3')
grapes_eat_sound = pygame.mixer.Sound('audios/grapes_eat.mp3')
next_level_sound = pygame.mixer.Sound('audios/next_level.mp3')
crash_sound = pygame.mixer.Sound('audios/crash.mp3')
#font = pygame.font.SysFont('arial', 25)

# Prompt for subject ID and number of attempts
subject_id = input("Enter Subject ID: ")
# num_attempts = int(input("Enter Number of Attempts: "))

if JOY_STICK:
    pygame.joystick.init()
    if pygame.joystick.get_count() > 0:
        joystick = pygame.joystick.Joystick(0)  # Get the first joystick
        joystick.init()  # Initialize the joystick
    else:
        print("No joysticks detected!")

#####-------------------------- set up EEG
PulseWidth = 0.01
if EEG_on:
    import serial
    import time
    port = serial.Serial("COM4", baudrate=115200) # for mac "/dev/tty.useserial-DN36MUIZ"

#####-------------------------- set up the eye tracker
if EYETRACKING_on:
    import socket
    # Host machine IP
    HOST = '127.0.0.1'
    # Gazepoint Port
    PORT = 4242
    ADDRESS = (HOST, PORT)

    # Connect to Gazepoint API
    tracker_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    tracker_socket.connect(ADDRESS)

    # Send commands to initialize data streaming
    tracker_socket.send(str.encode('<SET ID="ENABLE_SEND_CURSOR" STATE="1" />\r\n'))
    tracker_socket.send(str.encode('<SET ID="ENABLE_SEND_POG_FIX" STATE="1" />\r\n'))
    tracker_socket.send(str.encode('<SET ID="ENABLE_SEND_DATA" STATE="1" />\r\n'))

# Function to normalize gaze coordinates to screen coordinates
def normalize_gaze_to_screen(gaze_x, gaze_y, screen_w, screen_h):
    # Normalize the gaze coordinates to the screen resolution
    screen_x = gaze_x * screen_w
    screen_y = gaze_y * screen_h
    return screen_x, screen_y

def get_gaze_data(tracker_socket):
    rxdat = tracker_socket.recv(1024)
    data = bytes.decode(rxdat)
    # print(data)
    CX = None
    CY = None

    datalist = data.split(" ")

    # Iterate through list of substrings to extract data values
    for el in datalist:
        if (el.find("FPOGX") != -1):
            parts = el.split("\"")
            if len(parts) > 2 and parts[1]:
                CX = float(parts[1])  # Safely access the value
                # CX = float(el.split("\"")[1])
        if (el.find("FPOGY") != -1):
            parts = el.split("\"")
            if len(parts) > 2 and parts[1]:
                CY = float(parts[1])
                # CY = float(el.split("\"")[1])

    return CX, CY

def show_gaze(tracker_socket):
    screen_x = None
    screen_y = None
    gaze_x, gaze_y = get_gaze_data(tracker_socket)
    if gaze_x is not None and gaze_y is not None:
        # Normalize gaze coordinates to screen space
        screen_x, screen_y = normalize_gaze_to_screen(gaze_x, gaze_y, screen_w, screen_h)
    return screen_x, screen_y

#############---------------------------------------------------------------------------

directory_path = 'sub_' + str(subject_id)
if not os.path.exists(directory_path):
    os.makedirs(directory_path)

class Direction(Enum):
    RIGHT = 1
    LEFT = 2
    UP = 3
    DOWN = 4

Point = namedtuple('Point', 'x, y')

# rgb colors
WHITE = (255, 255, 255)
RED = (200,0,0)
BLUE1 = (75, 179, 253)
BLUE2 = (0, 255, 120)
BLACK = (0,0,0)
GREY = (60,60,60)
GREEN = (69,203,133)

BLOCK_SIZE = 40
scale_factor = 2
SPEED = 6

circle_radius = (BLOCK_SIZE * scale_factor) // 2 + 5


SET_SIZE = [1, 2] #1,2,4
DIST_DUR = 60000 #ms 10000
DIST_NUM = 1
FOOD_T = 2000
FROZEN_T = 2000
LOC_N = 16
direction_changes = 0
num_rows=5
num_cols=7
trials_data = []
# def calculate_circle_points(center_x, center_y, radius, num_points=12):
#     points = []
#     for i in range(num_points):
#         angle = 2 * math.pi * i / num_points  # Calculate angle for each point
#         x = int(center_x + radius * math.cos(angle))
#         y = int(center_y + radius * math.sin(angle))
#
#         # Align to the grid by ensuring x and y are multiples of BLOCK_SIZE
#         x = (x // BLOCK_SIZE) * BLOCK_SIZE
#         y = (y // BLOCK_SIZE) * BLOCK_SIZE
#
#         points.append(Point(x, y))
#     return points

def read_score(directory_path, score):
    total_end_score = 0
    if os.path.exists(directory_path):
        for filename in os.listdir(directory_path):
            if filename.endswith('.csv'):
                file_path = os.path.join(directory_path, filename)
                try:
                    df = pd.read_csv(file_path)
                    if 'end_score' in df.columns:
                        last_end_score = df['end_score'].iloc[-1]
                        total_end_score += last_end_score
                except Exception as e:
                    print(f"Error processing {filename}: {e}")
                    break
    text = 'Score: ' + str(score) + '           Total Score: ' + str(total_end_score + score)
    all_score = total_end_score + score
    return(text), all_score

def rank_current_score(score, working_dir=working_dir):
    # Initialize lists to store end_scores and corresponding subject_ids
    end_scores = []
    subject_ids = []

    # Iterate through all folders in the working directory
    for folder in os.listdir(working_dir):
        folder_path = os.path.join(working_dir, folder)

        # Check if the folder starts with "sub_" and is indeed a directory
        if folder.startswith("sub_") and os.path.isdir(folder_path):
            # Iterate through all files in the folder
            for file in os.listdir(folder_path):
                if file.endswith(".csv"):
                    file_path = os.path.join(folder_path, file)
                    # Read the CSV file
                    df = pd.read_csv(file_path)

                    # Get the last value of end_score and subject_id columns
                    if len(df)>2:
                        end_score = df['end_score'].iloc[-1]
                        end_scores.append(end_score)

    end_scores.append(score)
    # Convert the lists to a DataFrame for easier manipulation
    score_data = pd.DataFrame({
        'end_score': end_scores
    })

    # Sort the scores in descending order and reset the index
    sorted_scores = score_data.sort_values(by='end_score', ascending=False).reset_index(drop=True)
    # Get the rank of the current score (the last score in the list)
    current_score = score
    rank = sorted_scores[sorted_scores['end_score'] == current_score].index[0] + 1
    prop = np.round(100-rank/len(sorted_scores)*100,2)
    print(rank)
    # Create the output text
    output_text = f"Your score({score}) beats {prop}% of players. The top score is {sorted_scores['end_score'][0]}. Keep Up!"


    return output_text

def calculate_centered_grid_points(display_width, display_height, num_rows=num_rows, num_cols=num_cols):
    # Calculate the size of each cell
    cell_width = display_width* 2 / 3 // num_cols
    cell_height = display_height* 2 / 3 // num_rows

    # Calculate total grid dimensions
    grid_width = cell_width * num_cols
    grid_height = cell_height * num_rows

    # Calculate the top-left corner of the grid to center it on the screen
    start_x = (display_width - grid_width) // 2 + BLOCK_SIZE * scale_factor/2
    start_y = (display_height - grid_height) // 2 + BLOCK_SIZE * scale_factor/2

    points = []
    for row in range(num_rows):
        for col in range(num_cols):
            x = start_x + col * cell_width
            y = start_y + row * cell_height

            x = (x // BLOCK_SIZE) * BLOCK_SIZE
            y = (y // BLOCK_SIZE) * BLOCK_SIZE

            points.append(Point(x, y))

    return points

def get_quadrant_points(points, num_rows=num_rows, num_cols=num_cols):
    center_row = num_rows // 2
    center_col = num_cols // 2

    quadrants = {'top_left': [], 'top_right': [], 'bottom_left': [], 'bottom_right': []}

    for idx, point in enumerate(points):
        row = idx // num_cols
        col = idx % num_cols

        # Skip central row and column
        if row == center_row or col == center_col:
            continue

        if row < center_row and col < center_col:
            quadrants['top_left'].append(point)
        elif row < center_row and col > center_col:
            quadrants['top_right'].append(point)
        elif row > center_row and col < center_col:
            quadrants['bottom_left'].append(point)
        elif row > center_row and col > center_col:
            quadrants['bottom_right'].append(point)

    return quadrants

def get_quadrant(x, y, screen_w, screen_h):
    if x < screen_w / 2 and y < screen_h / 2:
        return 1#"top_left"
    elif x >= screen_w / 2 and y < screen_h / 2:
        return 2#"top_right"
    elif x < screen_w / 2 and y >= screen_h / 2:
        return 4#"bottom_left"
    else:
        return 3#"bottom_right"

# def select_random_points(quadrants, num_points=3):
#     selected_points = [None] * (num_points * 4)  # Initialize list with None placeholders
#
#     # Define the order of quadrants for indexing
#     quadrant_order = ['top_left', 'top_right', 'bottom_left', 'bottom_right']
#
#     for i, quadrant in enumerate(quadrant_order):
#         points = random.sample(quadrants[quadrant], num_points)
#         start_idx = i * num_points
#         selected_points[start_idx:start_idx + num_points] = points
#
#     return selected_points
def calculate_distance(p1, p2):
    return np.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2)
def jitter_point(point, points, max_jitter=BLOCK_SIZE/2, min_distance=BLOCK_SIZE*3):
    jittered_point = point
    attempts = 0
    valid = False
    while not valid and attempts < 100:
        jitter_x = random.randint(-max_jitter, max_jitter)
        jitter_y = random.randint(-max_jitter, max_jitter)
        jittered_point = Point((point.x + jitter_x) // BLOCK_SIZE * BLOCK_SIZE, (point.y + jitter_y) // BLOCK_SIZE * BLOCK_SIZE)

        valid = all(calculate_distance(jittered_point, existing_point) >= min_distance for existing_point in points)
        attempts += 1
    return jittered_point if valid else point

# def select_random_points(quadrants, num_points=4):
#     selected_points = []
#     all_points = []
#
#     # Define the order of quadrants for indexing
#     quadrant_order = ['top_left', 'top_right', 'bottom_left', 'bottom_right']
#
#     for quadrant in quadrant_order:
#         points = random.sample(quadrants[quadrant], num_points)
#         jittered_points = [jitter_point(p, all_points) for p in points]
#         all_points.extend(jittered_points)
#         selected_points.extend(jittered_points)
#
#     return selected_points

def select_random_points(quadrants, num_points=4):
    selected_points = []
    nonselected_points = []
    all_points = []

    # Define the order of quadrants for indexing
    quadrant_order = ['top_left', 'top_right', 'bottom_left', 'bottom_right']

    for quadrant in quadrant_order:
        points = quadrants[quadrant]
        jittered_points = [jitter_point(p, all_points) for p in points]
        # selected_points.extend(jittered_points)
        all_points.extend(jittered_points)

        selected_points.extend(random.sample(jittered_points, num_points))


        remaining_points = [p for p in jittered_points if p not in selected_points]
        nonselected_points.extend(remaining_points)

    return all_points, selected_points, nonselected_points

def start_trial():
    global current_trial_start_time
    current_trial_start_time = pygame.time.get_ticks()

class SnakeGame:

    def __init__(self, w=screen_w, h=screen_h): #w=1280, h=800

        # self.screen = pygame.display.set_mode((0, 0), pygame.FULLSCREEN)
        # self.w, self.h = self.screen.get_size()
        self.w = w
        self.h = h

        self.subject_id = subject_id

        # init display
        self.display = pygame.display.set_mode((self.w, self.h))
        self.max_score = 0
        pygame.display.set_caption('Snake')
        self.clock = pygame.time.Clock()
        self.keys_enabled = True

        # Load images
        self.snake_head_image = pygame.image.load('draws/snakehead3.png').convert_alpha()
        self.snake_body_image = pygame.image.load('draws/snakebody.png').convert_alpha()
        self.apple_image = pygame.image.load('draws/apple.png').convert_alpha()
        self.starfruit_image = pygame.image.load('draws/grapes.png').convert_alpha()
        self.grapes_image = pygame.image.load('draws/star.png').convert_alpha()
        self.bushes_image = pygame.image.load('draws/bushes.png').convert_alpha()
        self.apple_core_image = pygame.image.load('draws/apple_core.png').convert_alpha()


        # Resize images to fit the block size
        self.snake_head_image = pygame.transform.scale(self.snake_head_image, (BLOCK_SIZE * scale_factor, BLOCK_SIZE * scale_factor))
        self.apple_image = pygame.transform.scale(self.apple_image, (BLOCK_SIZE * scale_factor, BLOCK_SIZE * scale_factor))
        self.starfruit_image = pygame.transform.scale(self.starfruit_image, (BLOCK_SIZE * scale_factor, BLOCK_SIZE * scale_factor))
        self.grapes_image = pygame.transform.scale(self.grapes_image, (BLOCK_SIZE * scale_factor, BLOCK_SIZE * scale_factor))
        self.bushes_image = pygame.transform.scale(self.bushes_image, (BLOCK_SIZE * scale_factor, BLOCK_SIZE * scale_factor))
        self.apple_core_image = pygame.transform.scale(self.apple_core_image, (BLOCK_SIZE * scale_factor, BLOCK_SIZE * scale_factor))


        # init game state
        self.direction = Direction.RIGHT
        self.head = Point(self.w/2, self.h/2)
        self.snake = [self.head,
                      Point(self.head.x-BLOCK_SIZE, self.head.y),
                      Point(self.head.x-(2*BLOCK_SIZE), self.head.y)]

        self.score = 0
        self.total_score = 0
        self.target_score = 1500
        self.foods = []
        self.apples = []
        self.bananas = []
        self.all_locations = []
        self.potential_food_locations = []
        self.potential_grape_locations = []

        #calculate_circle_points(self.w // 2, self.h // 2, min(self.w, self.h) // 3)


        # Distraction
        self.special_food = []  # List to hold special food positions
        self.num_special_foods = DIST_NUM
        self.special_food_timer = None
        self.special_food_T = None
        self.special_food_active = False
        self.special_food_duration = DIST_DUR

        # Feedback for eaten food
        self.eaten_food = None
        self.eaten_food_timer = None
        self.eaten_food_duration = 1000

        # Feedback for wrong loc
        self.wrong_loc = None
        self.wrong_loc_timer = None
        self.wrong_loc_duration = 2000

        # showing score change
        self.score_change = 0
        self.score_change_timer = None
        self.score_change_duration = 1000

        self.change_display = 0
        self.snake_frozen = False
        self.last_wrong_loc = None

        self.game_over = False
        self.reset_idx =False

        self.firework_on = False
        self.firework_timer = None

        self.attempts = 1

        # Initialize trial data
        self.current_trial = {
                'trial_onset': None,
                'food_presentation_end': None,
                'food_number': None,
                'change_display': 0,
                'all_locs_xy': [],
                'bush_locs_xy': [],
                'key_presses_time': [],
                'key_presses_direction': [],
                'key_presses_key': [],
                'reminder_onset': [],
                'reminder_offset': [],
                'calibration_offset': [],
                'calibration_onset': [],
                'time_to_find_food': [],
                'time_to_find_food_corrected': [],
                'food_order': [],
                'initial_optimal_order': [],
                'updated_optimal_order': [],
                'time_to_nontarget': [],
                'nontarget_order': [],
                'time_to_dist': [],
                'dist_order': [],
                'eaten_sequence': [],  # 按时间顺序记录所有吃到的水果 [{type, position, time}]
                'food_locations': [],
                'food_locs_xy': [],
                'apple_locs_xy': [],
                'banana_locs_xy': [],
                'apple_quadrant': [],
                'banana_quadrant': [],
                'special_food': 0,
                'special_food_onset': None,
                'special_food_offset': None,
                'special_food_T': None,
                'special_food_loc': [],
                'special_food_locs_xy': [],
                'direction_changes_before_food': [],
                'direction_changes_before_food_corrected': [],
                'reminder_presses_before_food': [],
                'nontarget_before_food': [],
                'end_score': 0,
                'subject_id': subject_id,
                'attempt_number': self.attempts,
                'snake_pos': [],
                'gaze_pos':[],
                'time': [],
                'frozen_snake': [],
                'frozen_time': [],
                'gaze_pos_all':[]
            }

        # self.potential_food_locations, self.potential_grape_locations = select_random_points(get_quadrant_points(calculate_centered_grid_points(self.w, self.h)), num_points = int(LOC_N/4))

        # self.potential_food_locations = get_available_positions()
        # while len(self.potential_food_locations) < LOC_N:
        #     self.potential_food_locations = select_random_points(get_quadrant_points(calculate_centered_grid_points(self.w, self.h)), num_points = int(LOC_N/4))
        #     self.potential_food_locations = get_available_positions()


        # self.subject_number = self.get_subject_number_once()  # Asking for subject number once
        self.show_exp_control_screen()
        self.show_welcome_screen()
        self._place_food()



    def reset(self):
        global trials_data
        # initial snake
        self.direction = Direction.RIGHT
        self.head = Point(self.w / 2, self.h / 2)
        self.snake = [self.head,
                      Point(self.head.x - BLOCK_SIZE, self.head.y),
                      Point(self.head.x - (2 * BLOCK_SIZE), self.head.y)]
        self.score = 0
        self.foods = []
        self.apples = []
        self.bananas = []
        self.all_locations = []
        self.potential_food_locations = []
        self.potential_grape_locations = []

        trials_data = []
        self.current_trial = {
                'trial_onset': None,
                'food_presentation_end': None,
                'food_number': None,
                'change_display': 0,
                'all_locs_xy': [],
                'bush_locs_xy': [],
                'key_presses_time': [],
                'key_presses_direction': [],
                'key_presses_key': [],
                'reminder_onset': [],
                'reminder_offset': [],
                'calibration_onset': [],
                'calibration_offset': [],
                'time_to_find_food': [],
                'time_to_find_food_corrected': [],
                'food_order': [],
                'initial_optimal_order': [],
                'updated_optimal_order': [],
                'time_to_nontarget': [],
                'nontarget_order': [],
                'time_to_dist': [],
                'dist_order': [],
                'eaten_sequence': [],  # 按时间顺序记录所有吃到的水果
                'food_locations': [],
                'food_locs_xy': [],
                'apple_locs_xy': [],
                'banana_locs_xy': [],
                'apple_quadrant': [],
                'banana_quadrant': [],
                'special_food': 0,
                'special_food_onset': None,
                'special_food_offset': None,
                'special_food_T': None,
                'special_food_loc': [],
                'special_food_locs_xy': [],
                'direction_changes_before_food': [],
                'direction_changes_before_food_corrected': [],
                'reminder_presses_before_food': [],
                'nontarget_before_food': [],
                'end_score': 0,
                'subject_id': subject_id,
                'attempt_number': self.attempts,
                'snake_pos': [],
                'gaze_pos':[],
                'time': [],
                'frozen_snake': [],
                'frozen_time': [],
                'gaze_pos_all':[]
            }
        pygame.event.clear()
        self.show_welcome_screen()
        self._place_food()

        # self._place_food()

    def show_exp_control_screen(self):
        self.display.fill(GREY)

        # Render the welcome text
        welcome_text = font.render("Wait for the experimenter!", True, WHITE)
        text_rect = welcome_text.get_rect(center=(self.w // 2, self.h // 2))
        self.display.blit(welcome_text, text_rect)

        pygame.display.flip()  # Update the display

        # Wait for the space bar press
        waiting = True
        while waiting:
            for event in pygame.event.get():
                if event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_SPACE:
                        waiting = False  # Exit the loop and start the game
                    if event.key == pygame.K_q:
                        pygame.quit()
                        waiting = False

    def show_welcome_screen(self):
        self.display.fill(GREY)

        # Render the welcome text
        welcome_text = font.render("Take a break! Press x button to start the game when you are ready", True, WHITE)
        text_rect = welcome_text.get_rect(center=(self.w // 2, self.h // 2))
        self.display.blit(welcome_text, text_rect)

        pygame.display.flip()  # Update the display

        # Wait for the space bar press
        waiting = True
        while waiting:
            for event in pygame.event.get():
                if event.type == pygame.JOYBUTTONDOWN:
                    if event.button == 0:
                        waiting = False  # Exit the loop and start the game
                elif event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_q:
                        pygame.quit()
                        waiting = False
                    if event.key == pygame.K_SPACE:
                        waiting = False





    def show_end_screen(self, text):
        self.display.fill(GREY)

        # Render the welcome text
        welcome_text = font.render(text, True, WHITE)
        text_rect = welcome_text.get_rect(center=(self.w // 2, self.h // 2))
        self.display.blit(welcome_text, text_rect)
        pygame.display.flip()

    def draw_pie_chart(self, position = (PIE_X, PIE_Y), radius = PIE_RADIUS):
        # Calculate the angle for the filled portion
        if self.total_score >= self.target_score:
            fill_angle = 360  # Full circle if score is at or above target
        elif self.total_score <= 8:
            fill_angle = 2
        else:
            fill_angle = 360 * (self.total_score / self.target_score)

        pygame.draw.circle(self.display, WHITE, position, radius)
        points = [position]  # Start from the center
        for angle in range(int(fill_angle) + 1):
            x = position[0] + radius * math.cos(math.radians(angle - 90))
            y = position[1] + radius * math.sin(math.radians(angle - 90))
            points.append((x, y))
        pygame.draw.polygon(self.display, GREEN, points)
        pygame.draw.circle(self.display, GREY, position, radius/2)

        score_text = font.render(str(self.total_score), True, WHITE)
        text_rect = score_text.get_rect(center=position)
        self.display.blit(score_text, text_rect)



    def _place_food(self):
        global gaze_on
        global trial_start
        def get_available_positions(locs):
            """Filter out positions on the snake's path and future positions."""
            pygame.mouse.set_pos(0, 0)
            future_positions = set()
            x, y = self.snake[0].x, self.snake[0].y  # Head of the snake
            directions = {
            Direction.UP: (0, -BLOCK_SIZE),
            Direction.DOWN: (0, BLOCK_SIZE),
            Direction.LEFT: (-BLOCK_SIZE, 0),
            Direction.RIGHT: (BLOCK_SIZE, 0)
            }
            future_positions.add(self.snake[0])


            # Predict a few moves ahead based on current direction
            for _ in range(5):  # Look 3 moves ahead
                move = directions[self.direction]
                x += move[0]
                y += move[1]
                future_positions.add(Point(x, y))

            # Exclude positions occupied by the snake and the future positions
            return [p for p in locs if p not in future_positions] #p not in self.snake and

        # circle_points = calculate_circle_points(self.w // 2, self.h // 2, min(self.w, self.h) // 3)
        max_attempts = 10
        attempt_count = 0
        self.all_locations, self.potential_food_locations, self.potential_grape_locations = select_random_points(get_quadrant_points(calculate_centered_grid_points(self.w, self.h)), num_points = int(LOC_N/4))
        self.potential_food_locations = get_available_positions(self.potential_food_locations)
        while len(self.potential_food_locations) < LOC_N and attempt_count < max_attempts:
            self.all_locations, self.potential_food_locations, self.potential_grape_locations = select_random_points(get_quadrant_points(calculate_centered_grid_points(self.w, self.h)), num_points=int(LOC_N/4))
            self.potential_food_locations = get_available_positions(self.potential_food_locations)
            attempt_count += 1
        self.potential_grape_locations = get_available_positions(self.potential_grape_locations)



        # new_food = random.choice(circle_points)
        self.special_food = []
        #make sure new food are not in the path


        self.current_trial['all_locs_xy'] = [(point.x, point.y) for point in self.all_locations]
        self.current_trial['bush_locs_xy'] = [(point.x, point.y) for point in self.potential_food_locations]
        self.special_food_T = None

        if random.random() <= 1/3:
            FOOD_N = 1
        else:
            FOOD_N = 2

        self.current_trial['food_number'] = FOOD_N

        # get snake quadrant
        snake_x, snake_y = self.snake[0].x, self.snake[0].y
        snake_quadrant = get_quadrant(snake_x, snake_y, screen_w, screen_h)
        allowed_food_locations = [loc for loc in self.potential_food_locations if get_quadrant(loc[0], loc[1], screen_w, screen_h) != snake_quadrant]

        attempts = 1
        if FOOD_N == 1:
            while len(self.foods) < FOOD_N and attempts < 100:
                attempts += 1
                if random.random() <= 1/2:
                    new_apple = random.sample(allowed_food_locations, 1)[0]
                    new_banana = new_apple
                    apple_quadrant = get_quadrant(new_apple[0], new_apple[1], screen_w, screen_h)
                    banana_quadrant = get_quadrant(new_banana[0], new_banana[1], screen_w, screen_h)
                    if new_apple not in self.foods and new_apple not in self.snake[:2]:
                        self.foods.append(new_apple)
                        self.apples.append(new_apple)
                        self.current_trial['food_locs_xy'].append((new_apple.x, new_apple.y))
                        self.current_trial['apple_locs_xy'].append((new_apple.x, new_apple.y))
                        self.current_trial['apple_quadrant'].append(apple_quadrant)
                else:
                    new_banana = random.sample(allowed_food_locations, 1)[0]
                    new_apple = new_banana
                    apple_quadrant = get_quadrant(new_apple[0], new_apple[1], screen_w, screen_h)
                    banana_quadrant = get_quadrant(new_banana[0], new_banana[1], screen_w, screen_h)
                    if new_banana not in self.foods and new_banana not in self.snake[:2]:
                        self.foods.append(new_banana)
                        self.bananas.append(new_banana)
                        self.current_trial['food_locs_xy'].append((new_banana.x, new_banana.y))
                        self.current_trial['banana_locs_xy'].append((new_banana.x, new_banana.y))
                        self.current_trial['banana_quadrant'].append(banana_quadrant)



        if FOOD_N == 2:
            while len(self.foods) < FOOD_N and attempts < 100:
                attempts += 1
                # x = random.randint(0, (self.w-BLOCK_SIZE) // BLOCK_SIZE) * BLOCK_SIZE
                # y = random.randint(0, (self.h-BLOCK_SIZE) // BLOCK_SIZE) * BLOCK_SIZE
                # new_food = Point(x, y)
                new_apple,new_banana = random.sample(allowed_food_locations, 2)#random.choice(self.potential_food_locations)
                print(new_apple)
                apple_quadrant = get_quadrant(new_apple[0], new_apple[1], screen_w, screen_h)
                banana_quadrant = get_quadrant(new_banana[0], new_banana[1], screen_w, screen_h)
                food_distances = np.array([calculate_distance(new_apple, self.head), calculate_distance(new_banana, self.head)])
                # Ensure no overlap with existing food or snake body
                if new_apple not in self.foods and new_apple not in self.snake[:2] and new_banana not in self.foods and new_banana not in self.snake[:2] and (apple_quadrant != banana_quadrant):
                    #and (np.max(food_distances)/np.min(food_distances))>=1.5: #and (apple_quadrant != banana_quadrant) and (np.abs(apple_quadrant-banana_quadrant) != 2)
                    self.foods.append(new_apple)
                    self.foods.append(new_banana)
                    self.apples.append(new_apple)
                    self.bananas.append(new_banana)
                    self.current_trial['food_locs_xy'].append((new_apple.x, new_apple.y))
                    self.current_trial['food_locs_xy'].append((new_banana.x, new_banana.y))
                    self.current_trial['apple_locs_xy'].append((new_apple.x, new_apple.y))
                    self.current_trial['apple_quadrant'].append(apple_quadrant)
                    self.current_trial['banana_quadrant'].append(banana_quadrant)
                    self.current_trial['banana_locs_xy'].append((new_banana.x, new_banana.y))
                    self.current_trial['initial_optimal_order'] = np.argmin(food_distances)


        for foodi in range(FOOD_N):
            self.current_trial['food_locations'].append(self._get_food_location_number(self.foods[foodi], self.all_locations))

        trial_start = pygame.time.get_ticks()
        self.trial_start = trial_start
        self.current_trial['trial_onset'] = self.trial_start
        gaze_on = 1
        self.cue_start = pygame.time.get_ticks()
        if EEG_on:
            port.write(bytes([1])) #trial start
        self._show_food(timing = FOOD_T, sound = True)



        # distraction
        xx = random.random()
        if  (xx < 0.5): #(self.current_trial['food_number'] == 2) and
            print(xx)
            self.special_food_T = 1
            # if FOOD_N == 1:
            #     self.special_food_T = 1
            # elif FOOD_N == 2:
            #     if random.random() < 0.5:
            #         self.special_food_T = 1
            #     else:
            #         self.special_food_T = 2
            # elif FOOD_N == 3:
            #     if random.random() < 0.333:
            #         self.special_food_T = 1
            #     elif random.random() < 0.666:
            #         self.special_food_T = 2
            #     else:
            #         self.special_food_T = 3
            # elif FOOD_N == 4:
            #     if random.random() < 0.25:
            #         self.special_food_T = 1
            #     elif random.random() < 0.5:
            #         self.special_food_T = 2
            #     elif random.random() < 0.75:
            #         self.special_food_T = 3
            #     else:
            #         self.special_food_T = 4

            allowed_grape_locations = [loc for loc in self.potential_grape_locations if (get_quadrant(loc[0], loc[1], screen_w, screen_h) != snake_quadrant) and (get_quadrant(loc[0], loc[1], screen_w, screen_h) != apple_quadrant) and (get_quadrant(loc[0], loc[1], screen_w, screen_h) != banana_quadrant)] #if (get_quadrant(loc[0], loc[1], screen_w, screen_h) != snake_quadrant) and (get_quadrant(loc[0], loc[1], screen_w, screen_h) != apple_quadrant) and (get_quadrant(loc[0], loc[1], screen_w, screen_h) != banana_quadrant)]
            attempts =1
            while len(self.special_food) < self.num_special_foods and attempts < 100:
                attempts+=1
                new_special_food = random.choice(allowed_grape_locations)#random.choice(self.potential_grape_locations) #self.potential_food_locations
                # Ensure no overlap with existing food or snake body
                food_distances = np.array([calculate_distance(new_apple, new_special_food), calculate_distance(new_banana, new_special_food)])
                if (new_special_food not in self.special_food) and (new_special_food not in self.foods): #and (np.max(food_distances)/np.min(food_distances))>=1.5: #and (new_special_food not in self.snake)
                    self.special_food.append(new_special_food)
                    self.current_trial['special_food_loc'].append(self._get_food_location_number(new_special_food, self.all_locations))
                    self.current_trial['special_food_locs_xy'].append((new_special_food.x, new_special_food.y))
            # self.special_food = random.choice(available_locations)
            if len(self.special_food) == 0:
                self.special_food.append(new_special_food)
                self.current_trial['special_food_loc'].append(self._get_food_location_number(new_special_food, self.all_locations))
                self.current_trial['special_food_locs_xy'].append((new_special_food.x, new_special_food.y))
            self.current_trial['updated_optimal_order'] = np.argmin(food_distances)
            self.current_trial['special_food'] = 1
            self.current_trial['special_food_T'] = self.special_food_T


            if self.special_food_T == 1:
                self.special_food_active = True
                self.special_food_timer = pygame.time.get_ticks()
                self.current_trial['special_food_onset'] = pygame.time.get_ticks() - self.trial_start



    def _get_food_location_number(self, food_point, list_point):
        # Assuming the food location numbering starts at the top-center and goes clockwise
        for idx, point in enumerate(list_point):
            if food_point == point:
                return idx + 1  # 1-based index for food locations
        return None  # Should not happen if points are aligned correctly

    def _show_food(self, timing = FOOD_T, sound = False, reminder = 0):
        global direction_changes
        while pygame.time.get_ticks() - self.cue_start < timing:
            if EYETRACKING_on:
                screen_x, screen_y = show_gaze(tracker_socket)
                self.current_trial['gaze_pos'].append((screen_x, screen_y))
            self.current_trial['snake_pos'].append((self.snake[0].x, self.snake[0].y))
            self.current_trial['time'].append(pygame.time.get_ticks() - self.trial_start)

            self.display.fill(GREY)
            if sound == True:
                next_level_sound.play()
            self.keys_enabled = False
            if self.direction == Direction.RIGHT:
                rotated_head = pygame.transform.rotate(self.snake_head_image, 90)
                rotated_body = pygame.transform.rotate(self.snake_body_image, 90)
            elif self.direction == Direction.LEFT:
                rotated_head = pygame.transform.rotate(self.snake_head_image, 270)
                rotated_body = pygame.transform.rotate(self.snake_body_image, 90)
            elif self.direction == Direction.UP:
                rotated_head = pygame.transform.rotate(self.snake_head_image, 180)
                rotated_body = self.snake_body_image
            elif self.direction == Direction.DOWN:
                rotated_head = self.snake_head_image
                rotated_body = self.snake_body_image
            for i, pt in enumerate(self.snake):
                if (i != 0) and (i != len(self.snake) - 1):  # Body
                    # self.display.blit(rotated_body, pygame.Rect(pt.x, pt.y, BLOCK_SIZE * scale_factor, BLOCK_SIZE * scale_factor))
                    pygame.draw.rect(self.display, BLUE1, pygame.Rect(pt.x + BLOCK_SIZE * scale_factor // 4, pt.y + BLOCK_SIZE * scale_factor // 4, BLOCK_SIZE * scale_factor // 2, BLOCK_SIZE * scale_factor // 2))
                    # pygame.draw.rect(self.display, WHITE, pygame.Rect(pt.x+4, pt.y+4, 12 * scale_factor, 12 * scale_factor))
                elif i == len(self.snake) - 1:
                    pygame.draw.rect(self.display, BLUE1, pygame.Rect(pt.x + BLOCK_SIZE * scale_factor//3, pt.y + BLOCK_SIZE * scale_factor//3, BLOCK_SIZE * scale_factor // 3, BLOCK_SIZE * scale_factor // 3))
            for i, pt in enumerate(self.snake):
                if i == 0:  # Head
                    self.display.blit(rotated_head, pygame.Rect(pt.x, pt.y, BLOCK_SIZE * scale_factor, BLOCK_SIZE * scale_factor))
            # for pt in self.snake:
            #     pygame.draw.rect(self.display, BLUE1, pygame.Rect(pt.x, pt.y, BLOCK_SIZE * scale_factor, BLOCK_SIZE * scale_factor))
            #     pygame.draw.rect(self.display, BLUE2, pygame.Rect(pt.x+4, pt.y+4, 12 * scale_factor, 12 * scale_factor))
            for loc in self.potential_food_locations:
                self.display.blit(self.bushes_image, pygame.Rect(loc.x, loc.y, BLOCK_SIZE * scale_factor, BLOCK_SIZE * scale_factor))
            for food in self.apples:
                self.display.blit(self.apple_image, pygame.Rect(food.x, food.y, BLOCK_SIZE * scale_factor, BLOCK_SIZE * scale_factor))
            for food in self.bananas:
                self.display.blit(self.apple_image, pygame.Rect(food.x, food.y, BLOCK_SIZE * scale_factor, BLOCK_SIZE * scale_factor))

            # pygame.draw.rect(self.display, RED, pygame.Rect(food.x, food.y, BLOCK_SIZE, BLOCK_SIZE))
            _,self.total_score  = read_score(directory_path, self.score)
            self.draw_pie_chart()
            pygame.display.flip()


        pygame.event.clear()
        self.keys_enabled = True
        start_trial()
        direction_changes = 0
        self.current_trial['reminder_offset'].append(pygame.time.get_ticks() - self.trial_start)
        self.frozen_start = pygame.time.get_ticks()
        if EEG_on:
            if reminder:
                port.write(bytes([31])) #encoding frozen
            else:
                port.write(bytes([11]))
        self.current_trial['food_presentation_end'] = pygame.time.get_ticks() - self.trial_start

        #if reminder == 0:
        self.frozen_window()


    def frozen_window(self, timing = FROZEN_T, sound = False):
        self.current_trial['frozen_time'].append(pygame.time.get_ticks() - self.trial_start)
        global direction_changes
        self.display.fill(GREY)
        self.keys_enabled = False
        self.current_trial['frozen_snake'].append((self.snake[0].x, self.snake[0].y))
        for loc in self.potential_food_locations:
            self.display.blit(self.bushes_image, pygame.Rect(loc.x, loc.y, BLOCK_SIZE * scale_factor, BLOCK_SIZE * scale_factor))
        # Draw the fixation cross
        s_center_x = self.snake[0].x + BLOCK_SIZE * scale_factor // 2
        s_center_y = self.snake[0].y + BLOCK_SIZE * scale_factor // 2
        pygame.draw.line(self.display, WHITE, (s_center_x - BLOCK_SIZE * scale_factor // 2, s_center_y), (s_center_x + BLOCK_SIZE * scale_factor // 2, s_center_y), cross_thickness)
        pygame.draw.line(self.display, WHITE, (s_center_x, s_center_y - BLOCK_SIZE * scale_factor // 2), (s_center_x, s_center_y + BLOCK_SIZE * scale_factor // 2), cross_thickness)
        self.draw_pie_chart()
        if sound == True:
            next_level_sound.play()
        while pygame.time.get_ticks() - self.frozen_start < timing:
            if EYETRACKING_on:
                screen_x, screen_y = show_gaze(tracker_socket)
                self.current_trial['gaze_pos'].append((screen_x, screen_y))
            self.current_trial['snake_pos'].append((self.snake[0].x, self.snake[0].y))
            self.current_trial['time'].append(pygame.time.get_ticks() - self.trial_start)

            remaining_time = timing - (pygame.time.get_ticks() - self.frozen_start)
            self.display.fill(GREY)
            for loc in self.potential_food_locations:
                self.display.blit(self.bushes_image, pygame.Rect(loc.x, loc.y, BLOCK_SIZE * scale_factor, BLOCK_SIZE * scale_factor))
            # pygame.draw.line(self.display, RED, (s_center_x - BLOCK_SIZE * scale_factor // 2, s_center_y), (s_center_x + BLOCK_SIZE * scale_factor // 2, s_center_y), cross_thickness)
            # pygame.draw.line(self.display, RED, (s_center_x, s_center_y - BLOCK_SIZE * scale_factor // 2), (s_center_x, s_center_y + BLOCK_SIZE * scale_factor // 2), cross_thickness)
            pygame.draw.circle(self.display, BLUE1, (s_center_x, s_center_y), circle_radius * remaining_time/timing)  # 3 is the thickness of the circle

            _,self.total_score  = read_score(directory_path, self.score)
            self.draw_pie_chart()

            if self.score_change_timer and pygame.time.get_ticks() - self.score_change_timer < self.score_change_duration:
                score_color = (0, 255, 0) if self.score_change > 0 else (255, 0, 0)
                score_change_text = font.render(f"{'+' if self.score_change > 0 else ''}{self.score_change}", True, score_color)
                text_rect = score_change_text.get_rect(center = (self.snake[0][0], self.snake[0][1] + 10)) #(self.w // 2, self.h // 2)
                self.display.blit(score_change_text, text_rect)
            else:
                self.score_change = 0

            if EYETRACKING_on:
                screen_x, screen_y = show_gaze(tracker_socket)
                if screen_x is not None and screen_y is not None:
                    if EYETRACKING_practice:
                        pygame.draw.circle(self.display, BLACK, (int(screen_x), int(screen_y)), 10, 5)

            pygame.display.flip()
        # pygame.time.wait(timing)
        pygame.event.clear()
        self.keys_enabled = True
        start_trial()
        direction_changes = 0
        # self.current_trial['reminder_offset'].append(pygame.time.get_ticks() - self.trial_start)

    def snake_dance(self):
        while self.firework_on:
            self._move(self.direction) # update the head
            self.snake.insert(0, self.head)
            self.snake.pop()
            self._update_ui()
            self.clock.tick(SPEED)
            if self.direction == Direction.RIGHT:
                self.direction = Direction.UP
                self._move(self.direction) # update the head
                self.snake.insert(0, self.head)
                self.snake.pop()
                self._update_ui()
                self.clock.tick(SPEED)

                for i in np.arange(3):
                    self.direction = Direction.LEFT
                    self._move(self.direction) # update the head
                    self.snake.insert(0, self.head)
                    self.snake.pop()
                    self._update_ui()
                    self.clock.tick(SPEED)

                self.direction = Direction.DOWN
                self._move(self.direction) # update the head
                self.snake.insert(0, self.head)
                self.snake.pop()
                self._update_ui()
                self.clock.tick(SPEED)

                self.direction = Direction.RIGHT
                self._move(self.direction) # update the head
                self.snake.insert(0, self.head)
                self.snake.pop()
                self._update_ui()
                self.clock.tick(SPEED)
                self.firework_on = False

            elif self.direction == Direction.LEFT:
                self.direction = Direction.DOWN
                self._move(self.direction) # update the head
                self.snake.insert(0, self.head)
                self.snake.pop()
                self._update_ui()
                self.clock.tick(SPEED)

                for i in np.arange(3):
                    self.direction = Direction.RIGHT
                    self._move(self.direction) # update the head
                    self.snake.insert(0, self.head)
                    self.snake.pop()
                    self._update_ui()
                    self.clock.tick(SPEED)

                self.direction = Direction.UP
                self._move(self.direction) # update the head
                self.snake.insert(0, self.head)
                self.snake.pop()
                self._update_ui()
                self.clock.tick(SPEED)

                self.direction = Direction.LEFT
                self._move(self.direction) # update the head
                self.snake.insert(0, self.head)
                self.snake.pop()
                self._update_ui()
                self.clock.tick(SPEED)
                self.firework_on = False

            elif self.direction == Direction.UP:
                self.direction = Direction.LEFT
                self._move(self.direction) # update the head
                self.snake.insert(0, self.head)
                self.snake.pop()
                self._update_ui()
                self.clock.tick(SPEED)

                for i in np.arange(3):
                    self.direction = Direction.DOWN
                    self._move(self.direction) # update the head
                    self.snake.insert(0, self.head)
                    self.snake.pop()
                    self._update_ui()
                    self.clock.tick(SPEED)

                self.direction = Direction.RIGHT
                self._move(self.direction) # update the head
                self.snake.insert(0, self.head)
                self.snake.pop()
                self._update_ui()
                self.clock.tick(SPEED)

                self.direction = Direction.UP
                self._move(self.direction) # update the head
                self.snake.insert(0, self.head)
                self.snake.pop()
                self._update_ui()
                self.clock.tick(SPEED)
                self.firework_on = False

            elif self.direction == Direction.DOWN:
                self.direction = Direction.RIGHT
                self._move(self.direction) # update the head
                self.snake.insert(0, self.head)
                self.snake.pop()
                self._update_ui()
                self.clock.tick(SPEED)

                for i in np.arange(3):
                    self.direction = Direction.UP
                    self._move(self.direction) # update the head
                    self.snake.insert(0, self.head)
                    self.snake.pop()
                    self._update_ui()
                    self.clock.tick(SPEED)

                self.direction = Direction.LEFT
                self._move(self.direction) # update the head
                self.snake.insert(0, self.head)
                self.snake.pop()
                self._update_ui()
                self.clock.tick(SPEED)

                self.direction = Direction.DOWN
                self._move(self.direction) # update the head
                self.snake.insert(0, self.head)
                self.snake.pop()
                self._update_ui()
                self.clock.tick(SPEED)
                self.firework_on = False
        pygame.time.wait(500)

    def play_step(self):
        global direction_changes
        global gaze_on
        global gaze_xys
        if EYETRACKING_on:
            screen_x, screen_y = show_gaze(tracker_socket)
            self.current_trial['gaze_pos'].append((screen_x, screen_y))
        self.current_trial['snake_pos'].append((self.snake[0].x, self.snake[0].y))
        #self.current_trial['snake_pos'].append([(point.x, point.y) for point in self.snake])
        self.current_trial['time'].append(pygame.time.get_ticks() - self.trial_start)
        # gaze_thread = threading.Thread(target=collect_gaze_data, args=(tracker_socket,))
        # gaze_thread.daemon = True
        # gaze_thread.start()

        # 1. collect user input
        key_pressed = False
        eat_sound.stop()
        error_sound.stop()
        grapes_eat_sound.stop()
        next_level_sound.stop()
        if self.snake_frozen:
            self.keys_enabled = False
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                quit()
            if ((event.type == pygame.KEYDOWN) or (event.type == pygame.JOYAXISMOTION) or (event.type == pygame.JOYBUTTONDOWN) or (event.type == pygame.JOYHATMOTION)) and (self.keys_enabled):
                if key_pressed:  # Ignore if a key has already been processed
                    continue
                # Handling direction change
                if event.type == pygame.KEYDOWN:
                    if (event.key == pygame.K_LEFT):
                        if self.direction != Direction.RIGHT:  # Ignore if moving right
                            self._log_key_press('LEFT')
                            self.direction = Direction.LEFT
                            key_pressed = True
                            direction_changes += 1
                    elif (event.key == pygame.K_RIGHT):
                        if self.direction != Direction.LEFT:  # Ignore if moving left
                            self._log_key_press('RIGHT')
                            self.direction = Direction.RIGHT
                            key_pressed = True
                            direction_changes += 1
                    elif (event.key == pygame.K_UP):
                        if self.direction != Direction.DOWN:  # Ignore if moving down
                            self._log_key_press('UP')
                            self.direction = Direction.UP
                            key_pressed = True
                            direction_changes += 1
                    elif (event.key == pygame.K_DOWN):
                        if self.direction != Direction.UP:  # Ignore if moving up
                            self._log_key_press('DOWN')
                            self.direction = Direction.DOWN
                            key_pressed = True
                            direction_changes += 1
                    elif (event.key == pygame.K_o) and (EYETRACKING_on):
                        tracker_socket.send(str.encode('<SET ID="CALIBRATE_SHOW" STATE="1" />\r\n'))
                        tracker_socket.send(str.encode('<SET ID="CALIBRATE_START" STATE="1" />\r\n'))
                        self._log_calibration()
                        self.save_data_to_csv()
                        self.attempts +=1
                        self.max_score = 0
                        self.reset()
                    elif (event.key == pygame.K_s):
                        # Pause the game and show food items
                        self._log_reminder()
                        self.cue_start = pygame.time.get_ticks()
                        if EEG_on:
                            port.write(bytes([3])) #reminder
                        self._show_food(reminder=1)
                        self.score_change_timer = pygame.time.get_ticks()
                        start_trial()
                        direction_changes = 0
                        self.score_change = -1
                        self.score -= 1
                        if self.score_change_timer and pygame.time.get_ticks() - self.score_change_timer < self.score_change_duration:
                            score_color = (0, 255, 0) if self.score_change > 0 else (255, 0, 0)
                            score_change_text = font.render(f"{'+' if self.score_change > 0 else ''}{self.score_change}", True, score_color)
                            text_rect = score_change_text.get_rect(center=(self.w // 2, self.h // 2))
                            self.display.blit(score_change_text, text_rect)
                    elif (event.key == pygame.K_b):
                        self.save_data_to_csv()
                        self.attempts +=1
                        self.max_score = 0
                        self.reset()


                elif event.type ==  pygame.JOYAXISMOTION:
                    x_axis = joystick.get_axis(0)  # Left-Right movement (X-axis)
                    y_axis = joystick.get_axis(1)  # Up-Down movement (Y-axis)
                    threshold = 0.5

                    if x_axis < -threshold:
                        if self.direction != Direction.RIGHT:  # Ignore if moving right
                            self._log_key_press('LEFT')
                            self.direction = Direction.LEFT
                            key_pressed = True
                            direction_changes += 1
                    elif x_axis > threshold:
                        if self.direction != Direction.LEFT:  # Ignore if moving left
                            self._log_key_press('RIGHT')
                            self.direction = Direction.RIGHT
                            key_pressed = True
                            direction_changes += 1
                    elif y_axis < -threshold:
                        if self.direction != Direction.DOWN:  # Ignore if moving down
                            self._log_key_press('UP')
                            self.direction = Direction.UP
                            key_pressed = True
                            direction_changes += 1
                    elif y_axis > threshold:
                        if self.direction != Direction.UP:  # Ignore if moving up
                            self._log_key_press('DOWN')
                            self.direction = Direction.DOWN
                            key_pressed = True
                            direction_changes += 1

                elif event.type ==  pygame.JOYHATMOTION:
                    if event.value == (-1, 0):
                        if self.direction != Direction.RIGHT:  # Ignore if moving right
                            self._log_key_press('LEFT')
                            self.direction = Direction.LEFT
                            key_pressed = True
                            direction_changes += 1
                    elif event.value == (1, 0):
                        if self.direction != Direction.LEFT:  # Ignore if moving left
                            self._log_key_press('RIGHT')
                            self.direction = Direction.RIGHT
                            key_pressed = True
                            direction_changes += 1
                    elif event.value == (0, 1):
                        if self.direction != Direction.DOWN:  # Ignore if moving down
                            self._log_key_press('UP')
                            self.direction = Direction.UP
                            key_pressed = True
                            direction_changes += 1
                    elif event.value == (0, -1):
                        if self.direction != Direction.UP:  # Ignore if moving up
                            self._log_key_press('DOWN')
                            self.direction = Direction.DOWN
                            key_pressed = True
                            direction_changes += 1

                elif event.type == pygame.JOYBUTTONDOWN:
                    if event.button == 0:
                        # Pause the game and show food items
                        self._log_reminder()
                        self.cue_start = pygame.time.get_ticks()
                        if EEG_on:
                            port.write(bytes([3])) #reminder frozen
                        self._show_food(reminder=1)
                        self.score_change_timer = pygame.time.get_ticks()
                        start_trial()
                        direction_changes = 0
                        self.score_change = -1
                        self.score -= 1
                        if self.score_change_timer and pygame.time.get_ticks() - self.score_change_timer < self.score_change_duration:
                            score_color = (0, 255, 0) if self.score_change > 0 else (255, 0, 0)
                            score_change_text = font.render(f"{'+' if self.score_change > 0 else ''}{self.score_change}", True, score_color)
                            text_rect = score_change_text.get_rect(center=(self.w // 2, self.h // 2))
                            self.display.blit(score_change_text, text_rect)
                    elif  event.button == 1:
                        self.save_data_to_csv()
                        self.attempts +=1
                        self.max_score = 0
                        self.reset()





        # 2. move
        if not self.snake_frozen:
            self._move(self.direction) # update the head
            self.snake.insert(0, self.head)
            self.snake.pop()

        # 3. check if game over
        if self._is_collision():
            eat_sound.stop()
            error_sound.stop()
            grapes_eat_sound.stop()
            next_level_sound.stop()
            grapes_sound.stop()
            crash_sound.play()
            pygame.time.wait(2000)
            self.current_trial['end_score'] = self.score
            trials_data.append(self.current_trial)

            text =  rank_current_score(score)
            self.show_end_screen(text)
            pygame.time.wait(5000)

            if (self.subject_id != '999') and (self.total_score < 1500):
                self.game_over = False
                self.save_data_to_csv()
                self.attempts +=1
                self.max_score = 0
                self.reset()
            else:
                self.game_over = True

            return self.game_over, self.score

        # 4. check if food eaten
        # for food in self.foods:
        #     if self.head == food:
        #         self.score += 1  # Increase score by 1
        #         self.eaten_food = food  # Store the eaten food for feedback
        #         self.eaten_food_timer = pygame.time.get_ticks()  # Start the feedback timer
        #         self.foods.remove(food)  # Remove the food from the list
        #         if not self.foods:  # Only place new food when all current food is eaten
        #             self._place_food()
        #         # break

        # 4. place new food or just move
        if self.head in self.potential_food_locations:
            if self.head in self.foods:
                self.special_food_active = False
                eat_sound.play()
                if self.score > 0:
                    self.score += 1#(1 + self.score // 100)
                else:
                    self.score += 1

                self.eaten_food = self.head
                self.eaten_food_timer = pygame.time.get_ticks()

                self.foods.remove(self.head)
                if self.head in self.apples:
                    self.apples.remove(self.head)
                elif self.head in self.bananas:
                    self.bananas.remove(self.head)

                self.current_trial['time_to_find_food'].append(pygame.time.get_ticks() - self.trial_start)
                self.current_trial['time_to_find_food_corrected'].append(pygame.time.get_ticks() - current_trial_start_time)
                self.current_trial['direction_changes_before_food_corrected'].append(direction_changes)
                self.current_trial['food_order'].append(self._get_food_location_number(self.head, self.all_locations))
                
                # 记录到 eaten_sequence 汇总字段
                self.current_trial['eaten_sequence'].append({
                    'type': 'apple',
                    'position': (self.head.x, self.head.y),
                    'time': pygame.time.get_ticks() - self.trial_start
                })
                
                direction_changes = 0

                if not self.foods:
                    self.firework_on = True
                    self.firework_timer = pygame.time.get_ticks()

                if self.score > 0:
                    self.score_change = 1 #+ self.score // 100
                else:
                    self.score_change = 1
                self.score_change_timer = pygame.time.get_ticks()


                if self.foods:
                    if EEG_on:
                        port.write(bytes([41]))
                    self.frozen_start = pygame.time.get_ticks()
                    #self.frozen_window()
                start_trial()

                if (self.current_trial['food_number'] - len(self.foods) == 1) and (self.special_food_T == 2) and (len(self.foods) > 0):
                    self.special_food_active = True
                    self.special_food_timer = pygame.time.get_ticks()
                    self.current_trial['special_food_onset'] = pygame.time.get_ticks() - self.trial_start
                elif (self.current_trial['food_number'] - len(self.foods) == 2) and (self.special_food_T == 3) and (len(self.foods) > 0):
                    self.special_food_active = True
                    self.special_food_timer = pygame.time.get_ticks()
                    self.current_trial['special_food_onset'] = pygame.time.get_ticks() - self.trial_start


            elif (self.head not in self.foods) and not (self.head in self.special_food): #self.special_food_active and
                self.score -= 1
                self.current_trial['time_to_nontarget'].append(pygame.time.get_ticks() - self.trial_start)
                self.current_trial['nontarget_order'].append(self._get_food_location_number(self.head, self.all_locations))
                self.score_change = -1

                self.wrong_loc = self.head
                self.wrong_loc_timer = pygame.time.get_ticks()
                # self.last_wrong_loc = self.head
                error_sound.play()






        if self.special_food_active and self.head in self.special_food:
            grapes_sound.stop()
            grapes_eat_sound.play()
            if self.score > 0:
                self.score += 3#(3 + self.score // 100)  # Award 3 points
            else:
                self.score += 3
            self.current_trial['time_to_dist'].append(pygame.time.get_ticks() - self.trial_start)
            self.current_trial['dist_order'].append(self._get_food_location_number(self.head, self.all_locations))
            
            # 记录到 eaten_sequence 汇总字段
            self.current_trial['eaten_sequence'].append({
                'type': 'grape',
                'position': (self.head.x, self.head.y),
                'time': pygame.time.get_ticks() - self.trial_start
            })
            
            if self.score > 0:
                self.score_change = 3#3 + self.score // 100
            else:
                self.score_change = 3
            self.score_change_timer = pygame.time.get_ticks()

            self.special_food.remove(self.head)
            
            # 吃完葡萄后，更新 updated_optimal_order（从当前蛇头位置到剩余苹果的最优顺序）
            if len(self.foods) > 0:
                food_distances = np.array([calculate_distance(food, self.head) for food in self.foods])
                self.current_trial['updated_optimal_order'] = np.argsort(food_distances).tolist()

            if not self.special_food:
                self.current_trial['special_food_offset'] = pygame.time.get_ticks() - self.trial_start
                self.frozen_start = pygame.time.get_ticks()
                if EEG_on:
                    port.write(bytes([21])) #distraction frozen
                self.frozen_window()
                start_trial()
                direction_changes = 0
                self.special_food_active = False  # Remove special food after being eaten

        if  self.special_food_active and self.special_food:
            grapes_sound.play()
        else:
            grapes_sound.stop()





        # # 5. check penalty
        # for loc in self.potential_food_locations:
        #     if loc == self.head and loc not in self.foods:
        #         self.score -= 1  # Apply penalty
        #         break

        # 5. update ui and clock
        # self.snake.pop
        if (self.score // 10) > (self.max_score // 10):
            self.max_score = self.score
            # print(1, ',',  self.score, ',', self.max_score)
        # else:
        #     if not self.snake_frozen:
        #         self.snake.pop()

        if (self.score // 100) > (self.max_score // 100):
            self.change_display = 1
            self.current_trial['change_display'] = 1

        # 6. Check if score < 1500 and restart

        self._update_ui()
        self.clock.tick(SPEED)

        if not self.foods:  # Only place new food when all current food is eaten
            if EEG_on:
                port.write(bytes([101])) #trial start
            # gaze_data = gaze_data_queue.get_nowait()
            # gaze_on = 0
            # self.current_trial['gaze_pos_all'] = gaze_data
            # gaze_xys = []
            # gaze_data_queue.queue.clear()




            self.special_food_active = False
            grapes_eat_sound.stop()
            grapes_sound.stop()
            # if self.change_display:
            #     self.potential_food_locations = select_random_points(get_quadrant_points(calculate_centered_grid_points(self.w, self.h)), num_points = int(LOC_N/4))
            #     self.change_display = 0
            for foodi in range(self.current_trial['food_number']):
                if foodi == 0:
                    self.current_trial['direction_changes_before_food'].append(int(np.sum(np.array(self.current_trial['key_presses_time']) < self.current_trial['time_to_find_food'][foodi])))
                    self.current_trial['reminder_presses_before_food'].append(int(np.sum(np.array(self.current_trial['reminder_onset']) < self.current_trial['time_to_find_food'][foodi])))
                    self.current_trial['nontarget_before_food'].append(int(np.sum(np.array(self.current_trial['time_to_nontarget']) < self.current_trial['time_to_find_food'][foodi])))
                else:
                    self.current_trial['direction_changes_before_food'].append(int(np.sum((np.array(self.current_trial['key_presses_time']) < self.current_trial['time_to_find_food'][foodi])
                                                                                      & (np.array(self.current_trial['key_presses_time']) > self.current_trial['time_to_find_food'][foodi-1]))))
                    self.current_trial['reminder_presses_before_food'].append(int(np.sum((np.array(self.current_trial['reminder_onset']) < self.current_trial['time_to_find_food'][foodi])
                                                                                      & (np.array(self.current_trial['reminder_onset']) > self.current_trial['time_to_find_food'][foodi-1]))))
                    self.current_trial['nontarget_before_food'].append(int(np.sum((np.array(self.current_trial['time_to_nontarget']) < self.current_trial['time_to_find_food'][foodi])
                                                                                      & (np.array(self.current_trial['time_to_nontarget']) > self.current_trial['time_to_find_food'][foodi-1]))))


            self.current_trial['end_score'] = self.score
            #delete the first cue presentation
            self.current_trial['reminder_offset'] = self.current_trial['reminder_offset'][1:]
            trials_data.append(self.current_trial)
            self.current_trial = {
                'trial_onset': None,
                'food_presentation_end': None,
                'food_number': None,
                'change_display': 0,
                'all_locs_xy': [],
                'bush_locs_xy': [],
                'key_presses_time': [],
                'key_presses_direction': [],
                'key_presses_key': [],
                'reminder_onset': [],
                'reminder_offset': [],
                'calibration_onset': [],
                'calibration_offset': [],
                'time_to_find_food': [],
                'time_to_find_food_corrected': [],
                'food_order': [],
                'initial_optimal_order': [],
                'updated_optimal_order': [],
                'time_to_nontarget': [],
                'nontarget_order': [],
                'time_to_dist': [],
                'dist_order': [],
                'eaten_sequence': [],  # 按时间顺序记录所有吃到的水果
                'food_locations': [],
                'food_locs_xy': [],
                'apple_locs_xy': [],
                'banana_locs_xy': [],
                'apple_quadrant': [],
                'banana_quadrant': [],
                'special_food': 0,
                'special_food_onset': None,
                'special_food_offset': None,
                'special_food_T': None,
                'special_food_loc': [],
                'special_food_locs_xy': [],
                'direction_changes_before_food': [],
                'direction_changes_before_food_corrected': [],
                'reminder_presses_before_food': [],
                'nontarget_before_food': [],
                'end_score': 0,
                'subject_id': subject_id,
                'attempt_number': self.attempts,
                'snake_pos':[],
                'gaze_pos':[],
                'time': [],
                'frozen_snake': [],
                'frozen_time': [],
                'gaze_pos_all':[]
                }
            # pygame.time.wait(1000)
            self.snake_dance()
            self._place_food()
        # 6. return game over and score
        return self.game_over, self.score

    def _log_key_press(self, key):
        self.current_trial['key_presses_time'].append(pygame.time.get_ticks() - self.trial_start),
        self.current_trial['key_presses_direction'].append(self.direction.name),
        self.current_trial['key_presses_key'].append(key)


    def _log_reminder(self):
        self.current_trial['reminder_onset'].append(pygame.time.get_ticks() - self.trial_start)

    def _log_calibration(self):
            self.current_trial['calibration_onset'].append(pygame.time.get_ticks() - self.trial_start)

    def _is_collision(self):
        # hits boundary
        if self.head.x > self.w - BLOCK_SIZE or self.head.x < 0 or self.head.y > self.h - BLOCK_SIZE or self.head.y < 0:
            return True
        # hits itself
        if self.head in self.snake[1:]:
            return True

        return False

    def _update_ui(self):
        global direction_changes



        self.display.fill(GREY)
        if self.direction == Direction.RIGHT:
            rotated_head = pygame.transform.rotate(self.snake_head_image, 90)
            rotated_body = pygame.transform.rotate(self.snake_body_image, 90)
        elif self.direction == Direction.LEFT:
            rotated_head = pygame.transform.rotate(self.snake_head_image, 270)
            rotated_body = pygame.transform.rotate(self.snake_body_image, 90)
        elif self.direction == Direction.UP:
            rotated_head = pygame.transform.rotate(self.snake_head_image, 180)
            rotated_body = self.snake_body_image
        elif self.direction == Direction.DOWN:
            rotated_head = self.snake_head_image
            rotated_body = self.snake_body_image

        if not self.snake_frozen:
            for i, pt in enumerate(self.snake):
                if (i != 0) and (i != len(self.snake) - 1):  # Body
                    # self.display.blit(rotated_body, pygame.Rect(pt.x, pt.y, BLOCK_SIZE * scale_factor, BLOCK_SIZE * scale_factor))
                    pygame.draw.rect(self.display, BLUE1, pygame.Rect(pt.x + BLOCK_SIZE * scale_factor // 4, pt.y + BLOCK_SIZE * scale_factor // 4, BLOCK_SIZE * scale_factor // 2, BLOCK_SIZE * scale_factor // 2))
                elif i == len(self.snake) - 1:
                    pygame.draw.rect(self.display, BLUE1, pygame.Rect(pt.x + BLOCK_SIZE * scale_factor//3, pt.y + BLOCK_SIZE * scale_factor//3, BLOCK_SIZE * scale_factor // 3, BLOCK_SIZE * scale_factor // 3))
            # pygame.draw.rect(self.display, GREY, pygame.Rect(pt.x+4, pt.y+4, 12 * scale_factor, 12 * scale_factor))
            for i, pt in enumerate(self.snake):
                if i == 0:
                    self.display.blit(rotated_head, pygame.Rect(pt.x, pt.y, BLOCK_SIZE * scale_factor, BLOCK_SIZE * scale_factor))
        # for pt in self.snake:
        #     pygame.draw.rect(self.display, BLUE1, pygame.Rect(pt.x, pt.y, BLOCK_SIZE * scale_factor, BLOCK_SIZE * scale_factor))
        #     pygame.draw.rect(self.display, BLUE2, pygame.Rect(pt.x+4, pt.y+4, 12 * scale_factor, 12 * scale_factor))

        if not self.firework_on:
            for loc in self.potential_food_locations:
                self.display.blit(self.bushes_image, pygame.Rect(loc.x, loc.y, BLOCK_SIZE * scale_factor, BLOCK_SIZE * scale_factor))
            # pygame.draw.rect(self.display, BLACK, pygame.Rect(loc.x, loc.y, BLOCK_SIZE * scale_factor, BLOCK_SIZE * scale_factor))

        # Draw the special food if active (white square)
        if self.special_food_active and self.special_food:
            for s_loc in self.special_food:
                self.display.blit(self.grapes_image, pygame.Rect(s_loc.x, s_loc.y, BLOCK_SIZE * scale_factor, BLOCK_SIZE * scale_factor))
            # grapes_sound.play()
            if pygame.time.get_ticks() - self.special_food_timer > self.special_food_duration:
                self.current_trial['special_food_offset'] = pygame.time.get_ticks() - self.trial_start
                self.frozen_window()
                start_trial()
                direction_changes = 0
                # print(direction_changes)
                self.special_food_active = False  # Remove special food after 2 seconds
            # pygame.draw.rect(self.display, WHITE, pygame.Rect(self.special_food.x, self.special_food.y, BLOCK_SIZE, BLOCK_SIZE))

        # Draw the eaten food as feedback for 0.5 seconds
        if self.eaten_food and pygame.time.get_ticks() - self.eaten_food_timer < self.eaten_food_duration:
            if self.eaten_food in self.current_trial['apple_locs_xy']:
                self.display.blit(self.apple_image, pygame.Rect(self.eaten_food.x, self.eaten_food.y, BLOCK_SIZE * scale_factor, BLOCK_SIZE * scale_factor))
            elif self.eaten_food in self.current_trial['banana_locs_xy']:
                self.display.blit(self.apple_image, pygame.Rect(self.eaten_food.x, self.eaten_food.y, BLOCK_SIZE * scale_factor, BLOCK_SIZE * scale_factor))
            # pygame.draw.rect(self.display, RED, pygame.Rect(self.eaten_food.x, self.eaten_food.y, BLOCK_SIZE, BLOCK_SIZE))
        else:
            self.eaten_food = None  # Clear the feedback after 0.5 seconds

        # Draw the wrong loc feedback
        # if self.wrong_loc and pygame.time.get_ticks() - self.wrong_loc_timer < self.wrong_loc_duration:
        #     self.display.blit(self.apple_core_image, pygame.Rect(self.wrong_loc.x, self.wrong_loc.y, BLOCK_SIZE * scale_factor, BLOCK_SIZE * scale_factor))
        # else:
        #     self.wrong_loc = None

###############################################################
        if self.wrong_loc:
            if not self.last_wrong_loc or (self.head.x != self.last_wrong_loc.x or self.head.y != self.last_wrong_loc.y):
                self.snake_frozen = True
                self.freeze_triggered = True
                self.last_wrong_loc = self.head

        # if not (self.firework_on and (pygame.time.get_ticks() - self.firework_timer <= 500)):
        #     self.firework_on = False



        while self.snake_frozen:
            if EYETRACKING_on:
                screen_x, screen_y = show_gaze(tracker_socket)
                self.current_trial['gaze_pos'].append((screen_x, screen_y))
            self.current_trial['snake_pos'].append((self.snake[0].x, self.snake[0].y))
            self.current_trial['time'].append(pygame.time.get_ticks() - self.trial_start)

            self.keys_enabled = False
            if self.wrong_loc and pygame.time.get_ticks() - self.wrong_loc_timer < self.wrong_loc_duration:
                elapsed_time = pygame.time.get_ticks() - self.wrong_loc_timer
                cycle_duration = 2000 // 3  # 1-second freeze duration, 3 oscillation cycles
                oscillation_progress = (elapsed_time % cycle_duration) / cycle_duration  # Progress within one cycle

                # Create a surface for the snake to control transparency
                snake_surface = pygame.Surface(self.display.get_size(), pygame.SRCALPHA)
                self.display.blit(self.apple_core_image, pygame.Rect(self.wrong_loc.x, self.wrong_loc.y, BLOCK_SIZE * scale_factor, BLOCK_SIZE * scale_factor))

                # Determine the alpha value based on oscillation progress
                if oscillation_progress <= 0.5:
                    alpha_value = int(255 * (1 - 2 * oscillation_progress * 0.9))  # Full to 10% transparency
                else:
                    alpha_value = int(255 * (2 * (oscillation_progress - 0.5) * 0.9 + 0.1))  # 10% back to full transparency

                # Draw the snake body parts with transparency
                for i, pt in enumerate(self.snake):
                    if (i != 0) and (i != len(self.snake) - 1):  # Body
                        body_rect = pygame.Rect(
                            pt.x + BLOCK_SIZE * scale_factor // 4,
                            pt.y + BLOCK_SIZE * scale_factor // 4,
                            BLOCK_SIZE * scale_factor // 2,
                            BLOCK_SIZE * scale_factor // 2
                            )
                        pygame.draw.rect(snake_surface, (*BLUE1, alpha_value), body_rect)

                    elif i == len(self.snake) - 1:  # Tail
                        tail_rect = pygame.Rect(
                            pt.x + BLOCK_SIZE * scale_factor // 3,
                            pt.y + BLOCK_SIZE * scale_factor // 3,
                            BLOCK_SIZE * scale_factor // 3,
                            BLOCK_SIZE * scale_factor // 3
                            )
                        pygame.draw.rect(snake_surface, (*BLUE1, alpha_value), tail_rect)

                # Draw the snake head with transparency
                if len(self.snake) > 0:
                    head_pt = self.snake[0]
                    head_surface = rotated_head.copy()
                    head_surface.set_alpha(alpha_value)
                    snake_surface.blit(head_surface, (head_pt.x, head_pt.y))

                # Blit the transparent snake surface to the main display
                self.display.blit(snake_surface, (0, 0))

                # Draw the wrong location indicator
                _,self.total_score = read_score(directory_path, self.score)
                self.draw_pie_chart()
                pygame.display.flip()
            else:
                self.snake_frozen = False
                self.wrong_loc = None
                self.freeze_triggered = False
                self.keys_enabled = True
                self.score_change_timer = pygame.time.get_ticks()



    ############################################################

        # Draw the score change at the center of the screen
        if self.score_change_timer and pygame.time.get_ticks() - self.score_change_timer < self.score_change_duration:
            score_color = (0, 255, 0) if self.score_change > 0 else (255, 0, 0)
            score_change_text = font.render(f"{'+' if self.score_change > 0 else ''}{self.score_change}", True, score_color)
            text_rect = score_change_text.get_rect(center = (self.snake[0][0], self.snake[0][1] + 10)) #(self.w // 2, self.h // 2)
            self.display.blit(score_change_text, text_rect)
        else:
            self.score_change = 0



        # Now the agent can control the snake to find the food
        _,self.total_score  = read_score(directory_path, self.score)
        self.draw_pie_chart()

        # text = font.render("Score: " + str(self.score), True, WHITE)
        # self.display.blit(text, [int(self.w/2), 1])
        pygame.display.flip()

    def _move(self, direction):
        if not self.snake_frozen:
            x = self.head.x
            y = self.head.y
            if direction == Direction.RIGHT:
                x += BLOCK_SIZE
            elif direction == Direction.LEFT:
                x -= BLOCK_SIZE
            elif direction == Direction.DOWN:
                y += BLOCK_SIZE
            elif direction == Direction.UP:
                y -= BLOCK_SIZE

            self.head = Point(x, y)

    def save_data_to_csv(self):
        # Save all trials' data to a CSV file
        filename='sub_' + str(subject_id) + '/sub_' + str(subject_id) + '_game_' + str(self.attempts) + '.csv'
        with open(filename, mode='w', newline='') as file:
            writer = csv.DictWriter(file, fieldnames=self.current_trial.keys())
            writer.writeheader()
            writer.writerows(trials_data)

def collect_gaze_data(tracker_socket):
    gaze_xys = []
    sleep_time = 1/60
    # while gaze_on:
        #screen_x, screen_y = show_gaze(tracker_socket)
    while gaze_on:
        screen_x, screen_y = show_gaze(tracker_socket)
        gaze_xys.append((screen_x, screen_y))#(pygame.time.get_ticks() - trial_start)#.append((screen_x, screen_y))
        gaze_data_queue.put(gaze_xys)
        time.sleep(sleep_time)

# def save_gaze_data_to_csv():
#     with open(filename, mode='w', newline='') as file:
#         writer = csv.writer(file)
#         writer.writerow(['gaze_xys'])
#         while True:
#             # Check if there is any gaze data in the queue
#             if not gaze_data_queue.empty():
#                 gaze_data = gaze_data_queue.get()
#                 gaze_xys = gaze_data['gaze_xys']
#
#
#                 writer.writerow([gaze_xys])

gaze_data_queue = Queue()


if __name__ == '__main__':
    game = SnakeGame()
    # if EYETRACKING_on:
    # gaze_thread = threading.Thread(target=collect_gaze_data, args=(tracker_socket,))
    # gaze_thread.daemon = True
    # gaze_thread.start()
    #game loop
    while True:
        # gaze_thread = threading.Thread(target=collect_gaze_data, args=(tracker_socket,))
        # gaze_thread.daemon = True
        # gaze_thread.start()

        game_over, score = game.play_step()


        if game_over == True:
            if not os.path.exists(directory_path):
                os.makedirs(directory_path)
            game.save_data_to_csv()
            pygame.quit()
