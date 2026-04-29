"""
Snake Game Data Analysis Script
解析并分析网页版贪吃蛇游戏导出的 CSV 数据

使用方法:
    python parse.py
    
数据文件应放在 ./data/ 文件夹中
"""

import pandas as pd
import json
import ast
import os
from pathlib import Path
import numpy as np

def parse_field(x):
    """安全解析 JSON 或 Python 列表字符串"""
    if pd.isna(x) or x == '' or x == '[]':
        return []
    try:
        # 尝试作为 JSON 解析
        return json.loads(x)
    except:
        try:
            # 如果格式像 Python list (例如用单引号)，尝试用 ast 解析
            return ast.literal_eval(x)
        except:
            return x

def load_and_parse_csv(file_path):
    """读取并解析 CSV 文件"""
    print(f"正在读取文件: {file_path}")
    df = pd.read_csv(file_path)
    
    # 定义需要解析的 JSON 字符串列
    json_columns = [
        'snake_pos', 'time', 'food_locs_xy', 'bush_locs_xy', 
        'apple_locs_xy', 'banana_locs_xy', 'all_locs_xy',
        'time_to_find_food', 'food_order', 'dist_order', 'time_to_dist',
        'nontarget_order', 'time_to_nontarget', 'time_to_find_food_corrected',
        'direction_changes_before_food_corrected', 'reminder_presses_before_food',
        'nontarget_before_food', 'frozen_snake', 'frozen_time',
        'reminder_onset', 'reminder_offset', 'calibration_onset', 'calibration_offset'
    ]
    
    # 批量解析
    for col in json_columns:
        if col in df.columns:
            df[col] = df[col].apply(parse_field)
    
    print(f"成功加载 {len(df)} 个试次的数据")
    return df

def compare_with_standard(target_df, standard_path):
    """将目标 DataFrame 与标准 Python CSV 进行对比验证"""
    print("\n" + "="*60)
    print("标准一致性检查".center(60))
    print("="*60)
    
    if not os.path.exists(standard_path):
        print(f"⚠️ 警告: 未找到标准文件 {standard_path}，跳过对比检查")
        return
        
    try:
        std_df = pd.read_csv(standard_path)
        print(f"已加载标准文件: {os.path.basename(standard_path)}")
    except Exception as e:
        print(f"❌ 无法读取标准文件: {e}")
        return

    issues = []
    
    # 1. 检查列名一致性
    std_cols = list(std_df.columns)
    target_cols = list(target_df.columns)
    
    if std_cols != target_cols:
        # 找出缺失和多余的列
        missing = set(std_cols) - set(target_cols)
        extra = set(target_cols) - set(std_cols)
        
        if missing:
            issues.append(f"缺失字段: {', '.join(missing)}")
        if extra:
            issues.append(f"多余字段: {', '.join(extra)}")
        
        # 如果顺序不同
        if not missing and not extra:
            issues.append("字段顺序不匹配")
    else:
        print("✅ 字段列表和顺序完全匹配")

    # 2. 检查关键字段的数据格式
    # 选取几个典型字段检查格式
    check_fields = ['snake_pos', 'key_presses_key', 'food_locs_xy']
    
    for field in check_fields:
        if field in target_df.columns and field in std_df.columns:
            # 获取第一行非空数据
            target_sample = target_df[field].dropna().iloc[0] if len(target_df[field].dropna()) > 0 else None
            std_sample = std_df[field].dropna().iloc[0] if len(std_df[field].dropna()) > 0 else None
            
            if target_sample and std_sample:
                # 简单检查字符特征
                target_str = str(target_sample)
                std_str = str(std_sample)
                
                # 检查是否都是数组格式
                if (target_str.startswith('[') and std_str.startswith('[')) or \
                   (target_str.startswith('(') and std_str.startswith('(')):
                    pass # 格式基本一致
                else:
                    issues.append(f"字段 {field} 格式可能不一致: 目标='{target_str[:20]}...', 标准='{std_str[:20]}...'")
                
                # 检查引号风格 (Python 通常用单引号)
                if "'" in std_str and "'" not in target_str and '"' in target_str:
                     issues.append(f"字段 {field} 引号风格不一致 (标准用单引号，目标用双引号)")

    # 3. 报告结果
    if not issues:
        print("✅ 数据格式与标准文件高度一致")
        return True
    else:
        print(f"❌ 发现 {len(issues)} 个不一致项:")
        for issue in issues:
            print(f"  - {issue}")
        return False

def validate_trial_data(df):
    """验证试次数据的完整性和有效性"""
    print("\n" + "="*60)
    print("数据质量检查".center(60))
    print("="*60)
    
    # 筛选蛇游戏试次（如果存在 trial_type 列）
    if 'trial_type' in df.columns:
        exp_df = df[df['trial_type'] == 'snake-task'].copy()
    else:
        # 假设已经是筛选过的数据
        exp_df = df.copy()
    
    issues = []
    warnings = []
    
    for idx, row in exp_df.iterrows():
        trial_num = row.get('trial_number', idx + 1)
        
        # ① 检查 snake_pos 轨迹数量 > 10
        snake_pos = row.get('snake_pos', [])
        if isinstance(snake_pos, list):
            if len(snake_pos) <= 10:
                issues.append(f"Trial {trial_num}: 蛇轨迹点数过少 ({len(snake_pos)} ≤ 10)，轨迹可能不完整")
        
        # ② 检查 time_to_find_food 不为空
        time_to_find_food = row.get('time_to_find_food', [])
        if isinstance(time_to_find_food, list):
            if len(time_to_find_food) == 0:
                # 检查是否是因为撞墙/超时提前结束
                termination = row.get('termination_reason', '')
                if termination not in ['crash', 'self_collision', 'timeout', 'manual_quit']:
                    issues.append(f"Trial {trial_num}: time_to_find_food 为空，无法分析记忆表现")
        
        # ③ 检查 food_presentation_end > trial_onset（现在都是绝对时间）
        trial_onset = row.get('trial_onset', 0)
        food_presentation_end = row.get('food_presentation_end', 0)
        if trial_onset > 0 and food_presentation_end > 0:
            if food_presentation_end <= trial_onset:
                issues.append(f"Trial {trial_num}: 时间线异常 (food_presentation_end={food_presentation_end} <= trial_onset={trial_onset})")
        
        # ④ 检查 special_food_onset 在编码结束之后
        special_food_onset = row.get('special_food_onset', None)
        if special_food_onset is not None and not pd.isna(special_food_onset):
            if special_food_onset <= food_presentation_end:
                warnings.append(f"Trial {trial_num}: 特殊食物出现时机异常 (onset={special_food_onset} <= food_end={food_presentation_end})")
        
        # ⑤ 检查 time_to_dist、dist_order 在干扰试次中必须有值
        dist_order = row.get('dist_order', [])
        time_to_dist = row.get('time_to_dist', [])
        
        # 判断是否是干扰试次（有special_food_onset值）
        is_distractor_trial = special_food_onset is not None and not pd.isna(special_food_onset)
        
        if is_distractor_trial:
            # 干扰试次中，如果玩家没有吃到葡萄，可能为空，这是合理的
            # 但如果有special_food_offset（干扰食物被吃），则必须有数据
            special_food_offset = row.get('special_food_offset', None)
            if special_food_offset is not None and not pd.isna(special_food_offset):
                if not isinstance(dist_order, list) or len(dist_order) == 0:
                    warnings.append(f"Trial {trial_num}: 干扰试次中 dist_order 缺失（但有offset，说明吃到了葡萄）")
                if not isinstance(time_to_dist, list) or len(time_to_dist) == 0:
                    warnings.append(f"Trial {trial_num}: 干扰试次中 time_to_dist 缺失（但有offset，说明吃到了葡萄）")
        
        # ⑥ 检查 nontarget_before_food（这个检查比较特殊，不是每个trial都必须有错误）
        # 只在整个实验中做全局检查
    
    # 全局检查：nontarget_before_food 是否全部为空
    all_nontargets = []
    for idx, row in exp_df.iterrows():
        nontarget = row.get('nontarget_before_food', [])
        if isinstance(nontarget, list):
            all_nontargets.extend(nontarget)
    
    if len(all_nontargets) == 0 and len(exp_df) > 5:
        warnings.append(f"全局检查: 所有试次的 nontarget_before_food 均为空，可能没有记录到错误行为")
    
    # 输出结果
    print(f"\n检查的试次数: {len(exp_df)}")
    
    if len(issues) == 0:
        print("✅ 未发现严重数据问题")
    else:
        print(f"❌ 发现 {len(issues)} 个严重问题:")
        for issue in issues:
            print(f"  - {issue}")
    
    if len(warnings) == 0:
        print("✅ 未发现警告")
    else:
        print(f"⚠️  发现 {len(warnings)} 个警告:")
        for warning in warnings:
            print(f"  - {warning}")
    
    print("\n" + "="*60)
    
    return {'issues': issues, 'warnings': warnings}

def analyze_data(df):
    """生成数据分析报告"""
    print("\n" + "="*60)
    print("数据分析报告".center(60))
    print("="*60)
    
    # 筛选蛇游戏试次（如果存在 trial_type 列）
    if 'trial_type' in df.columns:
        exp_df = df[df['trial_type'] == 'snake-task'].copy()
    else:
        exp_df = df.copy()
    
    if len(exp_df) == 0:
        print("\n⚠️ 未找到蛇游戏试次数据")
        print("提示：请确认 CSV 文件是从贪吃蛇实验导出的")
        return df
    
    # 基本统计
    print(f"\n【基本信息】")
    print(f"  被试编号: {df['subject_id'].iloc[0] if 'subject_id' in df.columns else 'N/A'}")
    print(f"  总试次数: {len(exp_df)}")
    print(f"  实验版本: {df['experiment_version'].iloc[0] if 'experiment_version' in df.columns else 'N/A'}")
    
    # 分数统计
    print(f"\n【分数统计】")
    if 'end_score' in exp_df.columns and len(exp_df) > 0:
        final_scores = exp_df['end_score'].dropna()
        if len(final_scores) > 0:
            print(f"  最终累计分数: {final_scores.iloc[-1]}")
        if 'score' in exp_df.columns:
            scores = exp_df['score'].dropna()
            if len(scores) > 0:
                print(f"  平均每轮得分: {scores.mean():.2f}")
                print(f"  最高单轮得分: {scores.max()}")
                print(f"  最低单轮得分: {scores.min()}")
    
    # 时间统计
    print(f"\n【时间统计】")
    if 'rt' in exp_df.columns:
        total_time_sec = exp_df['rt'].sum() / 1000
        total_time_min = total_time_sec / 60
        print(f"  总游戏时间: {total_time_min:.2f} 分钟 ({total_time_sec:.0f} 秒)")
        print(f"  平均每轮时长: {exp_df['rt'].mean() / 1000:.2f} 秒")
    
    # 结束原因统计
    print(f"\n【试次结束原因】")
    if 'termination_reason' in exp_df.columns:
        termination_counts = exp_df['termination_reason'].value_counts()
        for reason, count in termination_counts.items():
            print(f"  {reason}: {count} 次 ({count/len(exp_df)*100:.1f}%)")
    
    # 食物相关统计
    print(f"\n【食物任务表现】")
    if 'time_to_find_food' in exp_df.columns:
        # 计算平均寻找食物时间
        all_food_times = []
        for times in exp_df['time_to_find_food']:
            if isinstance(times, list):
                all_food_times.extend(times)
        
        if all_food_times:
            print(f"  平均寻找食物时间: {np.mean(all_food_times):.0f} ms")
            print(f"  最快寻找时间: {np.min(all_food_times):.0f} ms")
            print(f"  最慢寻找时间: {np.max(all_food_times):.0f} ms")
    
    # 特殊食物（葡萄）统计
    print(f"\n【特殊食物（葡萄）统计】")
    grape_trials = exp_df[exp_df['dist_order'].apply(lambda x: len(x) > 0 if isinstance(x, list) else False)]
    print(f"  出现特殊食物的试次: {len(grape_trials)} 次")
    if len(grape_trials) > 0:
        total_grapes = sum(len(x) for x in grape_trials['dist_order'] if isinstance(x, list))
        print(f"  吃到葡萄总数: {total_grapes} 个")
        print(f"  葡萄获取率: {len(grape_trials)/len(exp_df)*100:.1f}%")
    
    # 错误统计
    print(f"\n【错误统计】")
    if 'nontarget_order' in exp_df.columns:
        total_errors = sum(len(x) for x in exp_df['nontarget_order'] if isinstance(x, list))
        print(f"  错误位置访问总数: {total_errors} 次")
        print(f"  平均每轮错误: {total_errors/len(exp_df):.2f} 次")
    
    # 提醒使用统计
    print(f"\n【提醒功能使用】")
    if 'reminder_presses_before_food' in exp_df.columns:
        reminder_trials = exp_df[exp_df['reminder_presses_before_food'].apply(
            lambda x: len(x) > 0 if isinstance(x, list) else False)]
        print(f"  使用提醒的试次: {len(reminder_trials)} 次")
        if len(reminder_trials) > 0:
            total_reminders = sum(sum(x) for x in exp_df['reminder_presses_before_food'] 
                                if isinstance(x, list))
            print(f"  提醒总使用次数: {total_reminders} 次")
    
    # 移动统计
    print(f"\n【移动行为统计】")
    if 'snake_pos' in exp_df.columns:
        total_steps = sum(len(x) for x in exp_df['snake_pos'] if isinstance(x, list))
        print(f"  总移动步数: {total_steps} 步")
        print(f"  平均每轮移动: {total_steps/len(exp_df):.1f} 步")
    
    print("\n" + "="*60)
    return exp_df

def save_summary(df, output_path, validation_result=None):
    """保存摘要统计到文件"""
    # 筛选蛇游戏试次（如果存在 trial_type 列）
    if 'trial_type' in df.columns:
        exp_df = df[df['trial_type'] == 'snake-task'].copy()
    else:
        # 如果没有 trial_type 列，直接使用原始数据
        exp_df = df.copy()
        print("提示：原始数据中没有 trial_type 列，直接使用所有数据生成摘要")
    
    if len(exp_df) == 0:
        print("⚠️ 无法生成摘要：未找到任何有效数据")
        return
    
    summary = {
        '被试编号': df['subject_id'].iloc[0] if 'subject_id' in df.columns and len(df) > 0 else 'N/A',
        '总试次数': len(exp_df),
        '最终分数': exp_df['end_score'].dropna().iloc[-1] if 'end_score' in exp_df.columns and len(exp_df['end_score'].dropna()) > 0 else 'N/A',
        '总时长_分钟': exp_df['rt'].sum() / 60000 if 'rt' in exp_df.columns else 'N/A',
        '平均每轮得分': exp_df['score'].mean() if 'score' in exp_df.columns and len(exp_df['score'].dropna()) > 0 else 'N/A',
        '撞墙次数': len(exp_df[exp_df['termination_reason'] == 'crash']) if 'termination_reason' in exp_df.columns else 'N/A',
        '完成试次数': len(exp_df[exp_df['termination_reason'] == 'completed']) if 'termination_reason' in exp_df.columns else 'N/A'
    }
    
    # 添加数据质量指标
    if validation_result:
        summary['数据质量_严重问题数'] = len(validation_result['issues'])
        summary['数据质量_警告数'] = len(validation_result['warnings'])
        summary['数据质量_通过'] = '是' if len(validation_result['issues']) == 0 else '否'
    
    summary_df = pd.DataFrame([summary])
    summary_df.to_csv(output_path, index=False, encoding='utf-8-sig')
    print(f"\n摘要已保存到: {output_path}")

def main():
    """主函数"""
    # 获取 data 文件夹路径
    data_dir = Path(__file__).parent / 'data'
    
    if not data_dir.exists():
        print(f"错误: 数据文件夹不存在: {data_dir}")
        print("请创建 data 文件夹并将 CSV 文件放入其中")
        return
    
    # 查找所有 CSV 文件，排除脚本生成的文件
    all_csv_files = list(data_dir.glob('*.csv'))
    
    # 过滤掉 summary_ 和 parsed_ 开头的文件
    csv_files = [
        f for f in all_csv_files 
        if not f.name.startswith('summary_') and not f.name.startswith('parsed_')
    ]
    
    if not csv_files:
        print(f"警告: 在 {data_dir} 中未找到原始 CSV 数据文件")
        print("请将导出的 CSV 文件放入 data 文件夹中")
        if all_csv_files:
            print(f"\n提示: 找到了 {len(all_csv_files)} 个文件，但都是脚本生成的输出文件")
        return
    
    print(f"找到 {len(csv_files)} 个 CSV 文件:")
    for i, f in enumerate(csv_files, 1):
        print(f"  {i}. {f.name}")
    
    # 标准文件路径 (根据用户环境硬编码，可修改)
    # 尝试在 data 父目录的 sub_1 文件夹中查找，或者直接指定
    standard_path = Path(r'd:\project\plublic-work\psychological_platform\sub_1\sub_1_game_3.csv')
    if not standard_path.exists():
        # 尝试相对路径
        standard_path = data_dir.parent.parent / 'sub_1' / 'sub_1_game_3.csv'

    # 分析每个文件
    for csv_file in csv_files:
        print(f"\n{'='*60}")
        print(f"分析文件: {csv_file.name}")
        print(f"{'='*60}")
        
        try:
            # 1. 读取原始数据（不解析 JSON）用于对比验证
            raw_df = pd.read_csv(csv_file)
            
            # 执行标准一致性检查
            if standard_path.exists():
                compare_with_standard(raw_df, str(standard_path))
            
            # 2. 解析数据用于后续分析
            df = load_and_parse_csv(csv_file)
            
            # 数据质量检查
            validation_result = validate_trial_data(df)
            
            # 分析
            exp_df = analyze_data(df)
            
            # 保存摘要
            summary_path = data_dir / f"summary_{csv_file.stem}.csv"
            save_summary(df, summary_path, validation_result)
            
            # 保存验证报告
            if validation_result['issues'] or validation_result['warnings']:
                validation_path = data_dir / f"validation_{csv_file.stem}.txt"
                with open(validation_path, 'w', encoding='utf-8') as f:
                    f.write("数据质量检查报告\n")
                    f.write("="*60 + "\n\n")
                    
                    if validation_result['issues']:
                        f.write(f"严重问题 ({len(validation_result['issues'])} 个):\n")
                        for issue in validation_result['issues']:
                            f.write(f"  - {issue}\n")
                        f.write("\n")
                    
                    if validation_result['warnings']:
                        f.write(f"警告 ({len(validation_result['warnings'])} 个):\n")
                        for warning in validation_result['warnings']:
                            f.write(f"  - {warning}\n")
                
                print(f"验证报告已保存到: {validation_path}")
            
            # 可选：保存解析后的完整数据
            parsed_path = data_dir / f"parsed_{csv_file.stem}.xlsx"
            exp_df.to_excel(parsed_path, index=False)
            print(f"解析后的数据已保存到: {parsed_path}")
            
        except Exception as e:
            print(f"错误: 处理文件 {csv_file.name} 时出错: {e}")
            import traceback
            traceback.print_exc()
    
    print("\n" + "="*60)
    print("分析完成！")
    print("="*60)

if __name__ == '__main__':
    main()
