"""
FactoryMind AI // 实体机器人数据对接示例脚本 (Real Robot Telemetry Bridge Demo)

功能说明:
- 模拟/对接真实工业机械臂（如 UR5e、ABB、KUKA、六轴机械臂或 ROS 节点）
- 周期性向 FactoryMind AI 发送机械臂末端坐标、关节角度、关节温度与夹爪状态
- 一旦发送数据，FactoryMind AI 界面会自动切换为「HARDWARE LINKED」真实机器人模式！

运行方法:
    python examples/connect_real_robot_demo.py
"""

import math
import time
import requests

API_ENDPOINT = "http://127.0.0.1:8080/api/robot/telemetry"


def main():
    print("=" * 65)
    print(" [FACTORYMIND AI] 正在连接实体机械臂控制器并建立遥测通道...")
    print("=" * 65)

    step = 0.0
    while True:
        step += 0.05
        # 1. 模拟或读取真实机械臂末端坐标 (mm)
        x = round(640.0 + math.sin(step) * 50.0, 1)
        y = round(-120.0 + math.cos(step) * 40.0, 1)
        z = round(850.0 + math.sin(step * 1.5) * 60.0, 1)
        pitch = round(45.0 + math.sin(step) * 15.0, 1)

        # 2. 模拟或读取真实关节角度 (度) 与 关节电机温度 (°C)
        j1 = round(math.sin(step) * 30.0 - 15.0, 1)
        j2 = round(math.cos(step * 0.8) * 35.0 + 40.0, 1)
        j3 = round(math.sin(step * 1.2) * 25.0 - 30.0, 1)
        j4 = 0.0
        j5 = round(45.0 + math.sin(step) * 10.0, 1)
        j6 = 90.0

        payload = {
            "robot_model": "UR5e / 6-Axis Physical Arm",
            "status": "RUNNING",
            "coordinates": {
                "x": x,
                "y": y,
                "z": z,
                "pitch": pitch,
                "roll": 0.0,
                "yaw": 90.0,
            },
            "joint_angles": [j1, j2, j3, j4, j5, j6],
            "joint_torques": [14.2, 28.5, 18.1, 5.4, 4.2, 2.1],
            "joint_temperatures": [36.2, 38.4, 35.1, 32.0, 31.5, 30.8],
            "gripper_clamped": True,
        }

        try:
            resp = requests.post(API_ENDPOINT, json=payload, timeout=2.0)
            if resp.status_code == 200:
                print(
                    f"-> [SYNC OK] X={x}mm, Y={y}mm, Z={z}mm | "
                    f"J1={j1} deg, J2={j2} deg"
                )
            else:
                print(f"! [SYNC WARN] HTTP {resp.status_code}: {resp.text}")
        except Exception as e:
            print(f"! [ERROR] 无法连接到 FactoryMind AI 后端: {e}")

        time.sleep(0.5)


if __name__ == "__main__":
    main()
