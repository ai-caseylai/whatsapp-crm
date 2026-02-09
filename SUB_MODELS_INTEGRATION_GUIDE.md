# 子模型集成指南 (Sub-Models Integration Guide)

## 概述

本系统已实现通用命令模板系统，允许用户通过快捷按钮生成预设命令，并在发送前进行修改。此架构支持扩展多种子模型：

- 🎨 **图片编辑** (Nano Banana) - 已实现
- 📈 **股票查询**
- 📅 **日历查询**
- 💊 **医药查询**
- 🌤️ **天气查询**
- 🌐 **翻译服务**
- ...更多

---

## 核心功能

### 1. `fillCommandTemplate()` - 通用命令填充函数

```javascript
fillCommandTemplate(command, modelType, metadata)
```

**参数：**
- `command` (string): 命令文本，会被填充到输入框
- `modelType` (string, 可选): 模型类型标识
- `metadata` (object, 可选): 额外元数据

**示例：**
```javascript
// 图片编辑
fillCommandTemplate('移除背景', 'image-edit', {
    imagePath: '/path/to/image.jpg',
    imageUrl: 'http://...'
});

// 股票查询
fillCommandTemplate('查詢 AAPL 的當前價格', 'stock', {
    symbol: 'AAPL'
});

// 日历查询
fillCommandTemplate('今天有什麼安排？', 'calendar');
```

### 2. 命令模板库 `commandTemplates`

已预定义常用命令模板：

```javascript
// 图片编辑
commandTemplates.imageEdit.removeBackground  // "移除背景"
commandTemplates.imageEdit.brighten          // "提高亮度"
commandTemplates.imageEdit.resize            // "調整大小為 [寬度]x[高度]"

// 股票查询
commandTemplates.stock.getPrice              // "查詢 [股票代碼] 的當前價格"
commandTemplates.stock.compare               // "比較 [股票A] 和 [股票B] 的表現"

// 日历
commandTemplates.calendar.today              // "今天有什麼安排？"
commandTemplates.calendar.addEvent           // "在 [日期] [時間] 添加活動：[活動名稱]"

// 医药
commandTemplates.medical.drugInfo            // "查詢藥物 [藥品名稱] 的信息"
commandTemplates.medical.sideEffects         // "[藥品名稱] 的副作用是什麼？"
```

---

## 如何添加新的子模型

### 步骤 1：定义命令模板

在 `commandTemplates` 对象中添加新类别：

```javascript
const commandTemplates = {
    // ... 现有模板 ...
    
    // 新增：天气查询
    weather: {
        current: '當前天氣如何？',
        forecast: '未來 [天數] 天的天氣預報',
        location: '[城市] 的天氣',
        alerts: '有什麼天氣警告嗎？'
    }
};
```

### 步骤 2：创建 UI 卡片

在合适的位置（如消息卡片、侧边栏）添加快捷按钮：

```javascript
const weatherCard = `
    <div class="my-3 p-3 bg-gradient-to-br from-sky-50 to-blue-50 rounded-lg border border-sky-200">
        <div class="text-sm font-bold text-gray-800 mb-2">🌤️ 天氣查詢</div>
        <div class="text-xs text-gray-600 mb-2">點擊快捷按鈕填充命令，可修改後再發送</div>
        <div class="flex flex-wrap gap-1">
            <button onclick="fillCommandTemplate('當前天氣如何？', 'weather')" 
                class="text-xs px-2 py-1 bg-white hover:bg-sky-100 border border-sky-300 rounded">
                🌡️ 當前天氣
            </button>
            <button onclick="fillCommandTemplate('未來 7 天的天氣預報', 'weather')" 
                class="text-xs px-2 py-1 bg-white hover:bg-blue-100 border border-blue-300 rounded">
                📊 7日預報
            </button>
            <button onclick="fillCommandTemplate('香港的天氣', 'weather')" 
                class="text-xs px-2 py-1 bg-white hover:bg-indigo-100 border border-indigo-300 rounded">
                📍 指定地點
            </button>
        </div>
    </div>
`;
```

### 步骤 3：添加模型显示名称

在 `getModelDisplayName()` 函数中添加：

```javascript
function getModelDisplayName(modelType) {
    const names = {
        'image-edit': '圖片編輯 (Nano Banana)',
        'stock': '股票查詢',
        'calendar': '日曆查詢',
        'medical': '醫藥查詢',
        'weather': '天氣查詢',      // 新增
        'translate': '翻譯服務'
    };
    return names[modelType] || '通用模型';
}
```

### 步骤 4：添加模型图标

在 `fillCommandTemplate()` 中的 `modelIcons` 对象添加：

```javascript
const modelIcons = {
    'image-edit': '🎨',
    'stock': '📈',
    'calendar': '📅',
    'medical': '💊',
    'weather': '🌤️',    // 新增
    'translate': '🌐'
};
```

### 步骤 5：实现后端 API

创建对应的后端处理端点：

```javascript
// server.js
app.post('/api/llm/weather-query', async (req, res) => {
    const { query, location } = req.body;
    
    // 调用天气 API 或子模型
    const response = await fetch('WEATHER_API_URL', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, location })
    });
    
    const data = await response.json();
    res.json({ success: true, result: data });
});
```

### 步骤 6：修改 `sendLLMMessage()` 函数

在发送消息时根据 `currentCommandModel` 路由到正确的 API：

```javascript
async function sendLLMMessage() {
    const input = document.getElementById('llm-input');
    const message = input.value.trim();
    
    if (!message) return;
    
    // 检查是否有特定模型类型
    const modelInfo = window.currentCommandModel;
    
    let apiEndpoint = '/api/llm/chat'; // 默认
    let requestBody = { message };
    
    if (modelInfo) {
        switch(modelInfo.type) {
            case 'image-edit':
                apiEndpoint = '/api/llm/edit-image';
                requestBody = {
                    instruction: message,
                    imagePath: currentEditingImage?.path,
                    history: llmChatHistory
                };
                break;
                
            case 'stock':
                apiEndpoint = '/api/llm/stock-query';
                requestBody = { query: message };
                break;
                
            case 'weather':
                apiEndpoint = '/api/llm/weather-query';
                requestBody = { query: message };
                break;
                
            // 更多模型...
        }
        
        // 清除模型选择
        delete window.currentCommandModel;
    }
    
    // 发送请求
    const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });
    
    // 处理响应...
}
```

---

## 实际示例：股票查询集成

### 1. 添加股票查询按钮到聊天消息

当检测到消息中提到股票代码时，显示快捷卡片：

```javascript
function renderStockQueryCard(symbol) {
    const card = `
        <div class="my-3 p-3 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-200">
            <div class="flex items-start gap-3">
                <div class="text-3xl">📈</div>
                <div class="flex-1">
                    <div class="text-sm font-bold text-gray-800 mb-1">股票查詢：${symbol}</div>
                    <div class="text-xs text-gray-600 mb-2">點擊快捷按鈕或自定義查詢</div>
                    <div class="flex flex-wrap gap-1">
                        <button onclick="fillCommandTemplate('查詢 ${symbol} 的當前價格', 'stock', {symbol: '${symbol}'})" 
                            class="text-xs px-2 py-1 bg-white hover:bg-green-100 border border-green-300 rounded">
                            💰 當前價格
                        </button>
                        <button onclick="fillCommandTemplate('顯示 ${symbol} 過去 30 天的走勢', 'stock', {symbol: '${symbol}'})" 
                            class="text-xs px-2 py-1 bg-white hover:bg-blue-100 border border-blue-300 rounded">
                            📊 30日走勢
                        </button>
                        <button onclick="fillCommandTemplate('${symbol} 的最新新聞', 'stock', {symbol: '${symbol}'})" 
                            class="text-xs px-2 py-1 bg-white hover:bg-purple-100 border border-purple-300 rounded">
                            📰 最新新聞
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    addLLMMessageToUI('assistant', card, true);
}
```

### 2. 后端实现

```javascript
// server.js
app.post('/api/llm/stock-query', async (req, res) => {
    const { query, symbol } = req.body;
    
    try {
        // 调用股票数据 API
        const stockData = await fetchStockData(symbol);
        
        // 使用 LLM 生成自然语言回复
        const llmResponse = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'openai/gpt-4-turbo',
                messages: [
                    {
                        role: 'system',
                        content: '你是股票分析助手，用简洁专业的方式回答股票相关问题。'
                    },
                    {
                        role: 'user',
                        content: `${query}\n\n股票数据：${JSON.stringify(stockData)}`
                    }
                ]
            })
        });
        
        const result = await llmResponse.json();
        
        res.json({
            success: true,
            analysis: result.choices[0].message.content,
            rawData: stockData
        });
        
    } catch (error) {
        console.error('Stock query error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

async function fetchStockData(symbol) {
    // 实际实现：调用 Alpha Vantage, Yahoo Finance 等 API
    // 这里是示例
    return {
        symbol: symbol,
        price: 150.25,
        change: +2.5,
        changePercent: +1.69,
        volume: 50000000
    };
}
```

---

## 用户体验流程

1. **触发**：用户点击"AI 编辑"按钮或提到特定关键词
2. **显示卡片**：系统显示相关的快捷按钮卡片
3. **填充命令**：用户点击快捷按钮，命令填充到输入框
4. **修改命令**：用户可以编辑命令文本（可选）
5. **发送**：用户点击发送按钮
6. **路由**：系统根据 `currentCommandModel` 路由到对应 API
7. **处理**：子模型处理请求并返回结果
8. **展示**：结果显示在聊天界面

---

## 最佳实践

### 1. 命令模板设计

✅ **好的设计：**
```javascript
'查詢 [股票代碼] 的當前價格'  // 明确占位符
'未來 [天數] 天的天氣預報'    // 可自定义参数
```

❌ **不好的设计：**
```javascript
'查詢股票'  // 太模糊
'天氣'      // 缺少上下文
```

### 2. 按钮分组

将相关功能按钮分组显示：

```javascript
<div class="space-y-2">
    <div class="text-xs text-gray-500">基礎查詢</div>
    <div class="flex gap-1">
        <!-- 基础按钮 -->
    </div>
    
    <div class="text-xs text-gray-500 mt-2">進階分析</div>
    <div class="flex gap-1">
        <!-- 高级按钮 -->
    </div>
</div>
```

### 3. 错误处理

```javascript
try {
    const response = await fetch(apiEndpoint, { /* ... */ });
    if (!response.ok) {
        throw new Error(`API 錯誤: ${response.status}`);
    }
    // 处理响应
} catch (error) {
    showNotification(`❌ ${error.message}`, 'error');
    console.error('Model error:', error);
}
```

### 4. 加载状态

```javascript
async function sendLLMMessage() {
    const sendBtn = document.querySelector('button[onclick="sendLLMMessage()"]');
    const originalHTML = sendBtn.innerHTML;
    
    try {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<div class="animate-spin">⏳</div>';
        
        // 发送请求...
        
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = originalHTML;
    }
}
```

---

## 扩展计划

### 短期 (1-2 周)
- [ ] 股票查询集成
- [ ] 日历事件查询
- [ ] 基础天气查询

### 中期 (1 个月)
- [ ] 医药信息查询
- [ ] 翻译服务
- [ ] 新闻摘要

### 长期 (3 个月)
- [ ] 自定义子模型插件系统
- [ ] 模型性能监控
- [ ] 多模型协作（Chain of Models）

---

## 技术架构

```
┌─────────────────┐
│   用户点击按钮   │
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│ fillCommandTemplate │ ← 填充命令到输入框
└────────┬────────────┘
         │
         ▼
┌─────────────────┐
│  用户修改命令    │ ← 可选
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ sendLLMMessage  │ ← 检查 currentCommandModel
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│  路由到对应 API      │ ← /api/llm/stock-query 等
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  子模型处理         │ ← Nano Banana, Stock API 等
└────────┬────────────┘
         │
         ▼
┌─────────────────┐
│   返回结果       │
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│  显示在聊天界面      │
└─────────────────────┘
```

---

## 联系与支持

如有疑问或需要协助集成新的子模型，请联系开发团队。

**文档版本:** v1.0  
**最后更新:** 2026-02-08
