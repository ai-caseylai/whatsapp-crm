// WhatsApp 天气查询集成
// 让用户可以通过 WhatsApp 查询香港天文台数据

const { 
    getCurrentWeather, 
    getWeatherByPlace, 
    get9DayForecast, 
    getWeatherWarnings,
    formatCurrentWeather,
    format9DayForecast 
} = require('./hko-api');

/**
 * 处理天气查询命令
 * @param {string} message - 用户消息
 * @returns {Promise<string>} 回复文本
 */
async function handleWeatherQuery(message) {
    const lowerMsg = message.toLowerCase().trim();
    
    try {
        // 查询当前天气
        if (lowerMsg.includes('天氣') || lowerMsg.includes('天气') || 
            lowerMsg.includes('气温') || lowerMsg.includes('氣溫') ||
            lowerMsg === 'weather' || lowerMsg === 'temp' ||
            lowerMsg.includes('現在') || lowerMsg.includes('现在')) {
            
            console.log('🌤️ 查询当前天气...');
            const weather = await getCurrentWeather();
            return formatCurrentWeather(weather, 10);
        }
        
        // 查询9天预报
        if (lowerMsg.includes('預報') || lowerMsg.includes('预报') ||
            lowerMsg.includes('未來') || lowerMsg.includes('未来') ||
            lowerMsg.includes('forecast') || lowerMsg.includes('9天') ||
            lowerMsg.includes('九天')) {
            
            console.log('📅 查询9天预报...');
            const forecast = await get9DayForecast();
            return format9DayForecast(forecast);
        }
        
        // 查询特定地点
        const placeMatch = message.match(/(京士柏|黃竹坑|打鼓嶺|流浮山|香港天文台|中環|尖沙咀|赤鱲角)/);
        if (placeMatch) {
            const place = placeMatch[1];
            console.log(`📍 查询 ${place} 天气...`);
            
            const placeWeather = await getWeatherByPlace(place);
            
            if (!placeWeather) {
                return `❌ 找不到 ${place} 的天氣數據`;
            }
            
            let reply = `📍 *${place} 天氣*\n`;
            reply += '━━━━━━━━━━━━━━━━\n';
            reply += `⏰ 更新時間: ${placeWeather.updateTime}\n\n`;
            
            if (placeWeather.temperature !== null) {
                reply += `🌡️ 氣溫: *${placeWeather.temperature}°C*\n`;
            }
            if (placeWeather.humidity !== null) {
                reply += `💧 相對濕度: ${placeWeather.humidity}%\n`;
            }
            if (placeWeather.rainfall !== null && placeWeather.rainfall > 0) {
                reply += `🌧️ 過去一小時降雨: ${placeWeather.rainfall}mm\n`;
            }
            
            reply += '\n━━━━━━━━━━━━━━━━\n';
            reply += '📡 數據來源: 香港天文台';
            
            return reply;
        }
        
        // 查询天气警告
        if (lowerMsg.includes('警告') || lowerMsg.includes('warning') ||
            lowerMsg.includes('颱風') || lowerMsg.includes('台风')) {
            
            console.log('⚠️ 查询天气警告...');
            const warnings = await getWeatherWarnings();
            
            let reply = '⚠️ *天氣警告*\n';
            reply += '━━━━━━━━━━━━━━━━\n';
            reply += `⏰ 更新時間: ${warnings.updateTime}\n\n`;
            
            if (warnings.warnings && warnings.warnings.length > 0) {
                warnings.warnings.forEach(w => {
                    reply += `⚠️ ${w.name}\n`;
                    if (w.code) reply += `   代碼: ${w.code}\n`;
                    if (w.actionCode) reply += `   狀態: ${w.actionCode}\n`;
                    reply += '\n';
                });
            } else {
                reply += '✅ 目前沒有生效的天氣警告\n\n';
            }
            
            if (warnings.warningMessages) {
                reply += `📝 ${warnings.warningMessages}\n\n`;
            }
            
            reply += '━━━━━━━━━━━━━━━━\n';
            reply += '📡 數據來源: 香港天文台';
            
            return reply;
        }
        
        // 帮助信息
        if (lowerMsg.includes('天氣幫助') || lowerMsg.includes('weather help')) {
            return getWeatherHelp();
        }
        
        return null; // 不是天气查询
        
    } catch (error) {
        console.error('❌ 天气查询失败:', error.message);
        return '❌ 天氣查詢出錯，請稍後再試';
    }
}

/**
 * 获取天气查询帮助信息
 */
function getWeatherHelp() {
    return `🌤️ *天氣查詢幫助*
━━━━━━━━━━━━━━━━

*可用指令：*

1️⃣ 查詢當前天氣
   • 天氣
   • 氣溫
   • weather
   • 現在天氣

2️⃣ 查詢9天預報
   • 預報
   • 未來天氣
   • 9天預報
   • forecast

3️⃣ 查詢特定地點
   • 京士柏 天氣
   • 黃竹坑 氣溫
   • 打鼓嶺 天氣

4️⃣ 查詢天氣警告
   • 警告
   • 天氣警告
   • 台風

5️⃣ 獲取幫助
   • 天氣幫助
   • weather help

━━━━━━━━━━━━━━━━
📡 數據來源: 香港天文台
💡 輸入以上任一指令即可查詢`;
}

/**
 * 检查消息是否为天气查询
 */
function isWeatherQuery(message) {
    const lowerMsg = message.toLowerCase().trim();
    const keywords = [
        '天氣', '天气', '气温', '氣溫', 'weather', 'temp',
        '預報', '预报', '未來', '未来', 'forecast',
        '警告', 'warning', '颱風', '台风'
    ];
    
    return keywords.some(keyword => lowerMsg.includes(keyword));
}

module.exports = {
    handleWeatherQuery,
    getWeatherHelp,
    isWeatherQuery
};

// 命令行测试
if (require.main === module) {
    (async () => {
        console.log('🧪 测试天气查询功能\n');
        
        const testMessages = [
            '天氣',
            '9天預報',
            '京士柏 天氣',
            '天氣幫助',
            '警告'
        ];
        
        for (const msg of testMessages) {
            console.log(`\n📝 测试消息: "${msg}"`);
            console.log('─'.repeat(40));
            const reply = await handleWeatherQuery(msg);
            console.log(reply);
            console.log('─'.repeat(40));
            await new Promise(r => setTimeout(r, 1000));
        }
        
        console.log('\n✅ 测试完成！');
    })();
}
