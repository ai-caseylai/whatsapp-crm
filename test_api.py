#!/usr/bin/env python3
"""
Casey CRM API 测试脚本
使用方法: python3 test_api.py
"""

import requests
import json
from datetime import datetime

# API 配置
API_BASE = "https://whatsapp-crm.techforliving.app"
TOKEN = "casey-crm"
SESSION_ID = "sess_9ai6rbwfe_1770361159106"
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

def print_section(title):
    """打印章节标题"""
    print("\n" + "="*50)
    print(f" {title}")
    print("="*50 + "\n")

def test_daily_stats():
    """测试获取今日统计"""
    print_section("1. 获取今日统计")
    
    response = requests.get(
        f"{API_BASE}/api/crm/stats/daily",
        params={"sessionId": SESSION_ID},
        headers=HEADERS
    )
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ 成功!")
        print(f"   今日发送: {data['sent']} 条")
        print(f"   日期: {data['date']}")
    else:
        print(f"❌ 失败: {response.status_code}")
        print(f"   {response.text}")

def test_get_contacts():
    """测试获取联系人列表"""
    print_section("2. 获取联系人列表（前5个）")
    
    response = requests.get(
        f"{API_BASE}/api/crm/contacts",
        params={"sessionId": SESSION_ID},
        headers=HEADERS
    )
    
    if response.status_code == 200:
        data = response.json()
        contacts = data.get('contacts', [])[:5]
        print(f"✅ 成功! 共 {len(data.get('contacts', []))} 个联系人")
        print(f"\n前5个联系人:")
        for i, contact in enumerate(contacts, 1):
            name = contact.get('custom_name') or contact.get('name') or contact.get('jid')
            last_msg = contact.get('last_message_time', 'N/A')
            print(f"   {i}. {name}")
            print(f"      JID: {contact.get('jid')}")
            print(f"      最后消息: {last_msg}")
    else:
        print(f"❌ 失败: {response.status_code}")
        print(f"   {response.text}")

def test_get_chats():
    """测试获取对话列表"""
    print_section("3. 获取对话列表（前5个）")
    
    response = requests.get(
        f"{API_BASE}/api/crm/chats",
        params={"sessionId": SESSION_ID, "limit": 5},
        headers=HEADERS
    )
    
    if response.status_code == 200:
        data = response.json()
        chats = data.get('chats', [])
        print(f"✅ 成功! 共 {len(chats)} 个对话")
        print(f"\n对话列表:")
        for i, chat in enumerate(chats, 1):
            name = chat.get('custom_name') or chat.get('name') or chat.get('jid')
            print(f"   {i}. {name}")
    else:
        print(f"❌ 失败: {response.status_code}")
        print(f"   {response.text}")

def test_get_messages():
    """测试获取消息"""
    print_section("4. 获取最新消息（前3条）")
    
    response = requests.get(
        f"{API_BASE}/api/crm/messages",
        params={"sessionId": SESSION_ID, "limit": 3},
        headers=HEADERS
    )
    
    if response.status_code == 200:
        data = response.json()
        messages = data.get('messages', [])
        print(f"✅ 成功! 获取到 {len(messages)} 条消息")
        print(f"\n最新消息:")
        for i, msg in enumerate(messages, 1):
            msg_type = msg.get('message_type', 'unknown')
            content = msg.get('text_content', '[媒体消息]')[:50]
            from_me = "我" if msg.get('from_me') else "对方"
            timestamp = msg.get('message_timestamp', 'N/A')
            print(f"   {i}. [{msg_type}] {from_me}: {content}")
            print(f"      时间: {timestamp}")
    else:
        print(f"❌ 失败: {response.status_code}")
        print(f"   {response.text}")

def test_export_csv():
    """测试导出联系人 CSV"""
    print_section("5. 导出联系人 CSV")
    
    response = requests.get(
        f"{API_BASE}/api/crm/contacts/export",
        params={"sessionId": SESSION_ID},
        headers=HEADERS
    )
    
    if response.status_code == 200:
        filename = f"contacts_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        with open(filename, 'wb') as f:
            f.write(response.content)
        print(f"✅ 成功! CSV 已保存到: {filename}")
    else:
        print(f"❌ 失败: {response.status_code}")
        print(f"   {response.text}")

def test_send_message_example():
    """发送消息示例（不实际执行）"""
    print_section("6. 发送消息示例（代码示例）")
    
    example_code = '''
# 发送单条消息
response = requests.post(
    f"{API_BASE}/api/crm/messages/send",
    headers=HEADERS,
    json={
        "sessionId": SESSION_ID,
        "recipient": "85298765432@s.whatsapp.net",
        "text": "Hello from API!"
    }
)

# 群发消息
response = requests.post(
    f"{API_BASE}/api/crm/messages/broadcast",
    headers=HEADERS,
    json={
        "sessionId": SESSION_ID,
        "recipients": [
            "85298765432@s.whatsapp.net",
            "85287654321@s.whatsapp.net"
        ],
        "text": "群发消息内容"
    }
)
'''
    print("📝 代码示例:")
    print(example_code)

def main():
    """主函数"""
    print("\n" + "="*50)
    print(" Casey CRM API 测试脚本")
    print("="*50)
    print(f"\n🔗 API Base: {API_BASE}")
    print(f"🔑 Token: {TOKEN}")
    print(f"📱 Session ID: {SESSION_ID}")
    
    try:
        # 运行测试
        test_daily_stats()
        test_get_contacts()
        test_get_chats()
        test_get_messages()
        test_export_csv()
        test_send_message_example()
        
        print("\n" + "="*50)
        print(" 测试完成！")
        print("="*50 + "\n")
        
    except Exception as e:
        print(f"\n❌ 错误: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
