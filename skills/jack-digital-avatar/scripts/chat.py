import os
import re
from datetime import datetime
from typing import Optional

try:
    from openai import OpenAI
except ImportError:
    raise ImportError("请安装 openai 库: pip install openai")

NEGATIVE_KEYWORDS = [
    "累", "烦", "难过", "低落", "焦虑", "迷茫", "压力大", "沮丧", "失落",
    "绝望", "心累", "崩溃", "不想干了", "想放弃", "坚持不住", "好难",
    "怎么办", "烦死了", "累了", "好烦", "不爽", "痛苦", "难受", "撑不住了"
]

ENCOURAGE_KEYWORDS = [
    "加油", "鼓励我", "给我力量", "好累啊", "坚持不住了", "帮帮我",
    "怎么办", "求鼓励", "打打气", "撑不住"
]

DEFAULT_REPLY = "哎呀，怎么啦？不管发生什么，你都很棒呀！💪 记住，你已经很努力了，偶尔停下来休息也没关系的～相信自己，你一定可以的！🌟"

HISTORY_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
MAX_HISTORY_LINES = 50
CONTEXT_LINES = 10

CLIENT: Optional[OpenAI] = None


def init_client(api_key: str, base_url: str = "https://api.deepseek.com"):
    """初始化 DeepSeek 客户端"""
    global CLIENT
    CLIENT = OpenAI(api_key=api_key, base_url=base_url)


def should_respond(message: str) -> bool:
    """判断是否应该回复（包含负面关键词）"""
    message_lower = message.lower()
    for keyword in NEGATIVE_KEYWORDS + ENCOURAGE_KEYWORDS:
        if keyword in message_lower:
            return True
    return False


def get_history(user_id: str) -> str:
    """获取对话历史"""
    history_file = os.path.join(HISTORY_DIR, f"chat_{user_id}.txt")
    if not os.path.exists(history_file):
        return ""
    with open(history_file, "r", encoding="utf-8") as f:
        lines = f.readlines()
    recent_lines = lines[-CONTEXT_LINES:] if len(lines) > CONTEXT_LINES else lines
    return "".join(recent_lines)


def save_message(user_id: str, role: str, message: str):
    """保存消息到历史"""
    os.makedirs(HISTORY_DIR, exist_ok=True)
    history_file = os.path.join(HISTORY_DIR, f"chat_{user_id}.txt")
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(history_file, "a", encoding="utf-8") as f:
        f.write(f"[{timestamp}] {role}: {message}\n")
    trim_history(history_file)


def trim_history(history_file: str):
    """裁剪历史记录，保留最近 MAX_HISTORY_LINES 条"""
    if not os.path.exists(history_file):
        return
    with open(history_file, "r", encoding="utf-8") as f:
        lines = f.readlines()
    if len(lines) > MAX_HISTORY_LINES:
        with open(history_file, "w", encoding="utf-8") as f:
            f.writelines(lines[-MAX_HISTORY_LINES:])


def generate_reply(user_message: str, history: str = "", model: str = "deepseek-chat") -> str:
    """调用 DeepSeek 生成回复"""
    if not CLIENT:
        return DEFAULT_REPLY
    
    system_prompt = """你是一个阳光可爱的正能量小姐姐"小暖"，性格温柔、乐观、亲切。

用户的最新消息：{user_message}
对话历史：{history}

请根据以上信息，生成一段温暖可爱的正能量回复，要求：
1. 100-200字
2. 先共情，再鼓励，最后给一个小行动建议
3. 语气亲切可爱，适当用语气词（呀、呢、哦）
4. 适当使用emoji（💪🌟😊）
5. 禁止说教、讲道理、使用命令式语气"""

    system_prompt = system_prompt.format(user_message=user_message, history=history or "无")
    
    try:
        response = CLIENT.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            max_tokens=300,
            temperature=0.8
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"API调用错误: {e}")
        return DEFAULT_REPLY


def get_reply(user_id: str, user_message: str, api_key: str = None, model: str = "deepseek-chat") -> str:
    """获取正能量回复（主入口）"""
    if api_key:
        init_client(api_key)
    
    user_message = user_message.strip()
    if not user_message:
        return ""
    
    if not should_respond(user_message):
        return ""
    
    history = get_history(user_id)
    save_message(user_id, "用户", user_message)
    
    reply = generate_reply(user_message, history, model)
    
    save_message(user_id, "小暖", reply)
    
    return reply


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("用法: python chat.py <user_id> <message> [api_key]")
        sys.exit(1)
    
    user_id = sys.argv[1]
    message = sys.argv[2]
    api_key = sys.argv[3] if len(sys.argv) > 3 else os.environ.get("DEEPSEEK_API_KEY")
    
    if api_key:
        init_client(api_key)
    
    reply = get_reply(user_id, message, api_key)
    print(reply)