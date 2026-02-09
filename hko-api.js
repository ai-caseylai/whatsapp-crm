// 香港天文台 API 集成
// 支持查询实时天气数据、气温、降雨量、湿度等

const HKO_API_BASE = 'https://data.weather.gov.hk/weatherAPI/opendata';

/**
 * 香港天文台数据类型
 */
const HKO_DATA_TYPES = {
    CURRENT_WEATHER: 'rhrread',      // 本港地區天氣報告（实时）
    FORECAST_9DAY: 'fnd',            // 9天天气预报
    FORECAST_CURRENT: 'flw',         // 本港地区天气预报
    WARNING: 'warnsum',              // 天气警告摘要
    TROPICAL_CYCLONE: 'tc',          // 热带气旋信息
};

/**
 * 查询香港天文台数据
 * @param {string} dataType - 数据类型
 * @param {string} lang - 语言 (tc/en/sc)
 * @returns {Promise<object>} 查询结果
 */
async function queryHKOData(dataType = 'rhrread', lang = 'tc') {
    try {
        const url = `${HKO_API_BASE}/weather.php?dataType=${dataType}&lang=${lang}`;
        
        console.log(`🌐 查询香港天文台: ${url}`);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        return data;
        
    } catch (error) {
        console.error('❌ 香港天文台 API 查询失败:', error.message);
        throw error;
    }
}

/**
 * 获取当前天气报告
 * @returns {Promise<object>} 天气报告
 */
async function getCurrentWeather() {
    const data = await queryHKOData(HKO_DATA_TYPES.CURRENT_WEATHER);
    
    // 解析数据
    const result = {
        updateTime: data.updateTime,
        temperature: data.temperature?.data || [],
        rainfall: data.rainfall?.data || [],
        humidity: data.humidity?.data || [],
        icon: data.icon || [],
        iconUpdateTime: data.iconUpdateTime,
        uvIndex: data.uvindex,
        warningMessage: data.warningMessage || ''
    };
    
    return result;
}

/**
 * 获取指定地点的天气
 * @param {string} place - 地点名称
 * @returns {Promise<object>} 天气数据
 */
async function getWeatherByPlace(place) {
    const weather = await getCurrentWeather();
    
    // 在所有数据中查找匹配的地点
    const temp = weather.temperature.find(t => t.place === place);
    const rain = weather.rainfall.find(r => r.place === place);
    const humid = weather.humidity.find(h => h.place === place);
    
    if (!temp && !rain && !humid) {
        return null;
    }
    
    return {
        place: place,
        updateTime: weather.updateTime,
        temperature: temp?.value || null,
        rainfall: rain?.max || rain?.min || null,
        humidity: humid?.value || null
    };
}

/**
 * 获取9天天气预报
 * @returns {Promise<object>} 天气预报
 */
async function get9DayForecast() {
    const data = await queryHKOData(HKO_DATA_TYPES.FORECAST_9DAY);
    
    return {
        updateTime: data.updateTime,
        generalSituation: data.generalSituation,
        forecast: data.weatherForecast.map(day => ({
            date: day.forecastDate,
            week: day.week,
            temp: {
                min: day.forecastMintemp?.value,
                max: day.forecastMaxtemp?.value,
                unit: day.forecastMintemp?.unit || '°C'
            },
            humidity: {
                min: day.forecastMinrh?.value,
                max: day.forecastMaxrh?.value,
                unit: day.forecastMinrh?.unit || '%'
            },
            weather: day.forecastWeather,
            wind: day.forecastWind,
            icon: day.ForecastIcon
        }))
    };
}

/**
 * 获取天气警告
 * @returns {Promise<object>} 警告信息
 */
async function getWeatherWarnings() {
    const data = await queryHKOData(HKO_DATA_TYPES.WARNING);
    
    return {
        updateTime: data.updateTime,
        warnings: data.WTMW || [],
        warningMessages: data.message || ''
    };
}

/**
 * 格式化当前天气为可读文本
 * @param {object} weather - 天气数据
 * @param {number} limit - 显示地点数量
 * @returns {string} 格式化文本
 */
function formatCurrentWeather(weather, limit = 5) {
    if (!weather) {
        return '沒有找到天氣數據';
    }
    
    let text = `🌤️ 香港天氣報告\n`;
    text += `━━━━━━━━━━━━━━━━\n`;
    text += `⏰ 更新時間: ${weather.updateTime}\n\n`;
    
    // 天气警告
    if (weather.warningMessage && weather.warningMessage.length > 0) {
        text += `⚠️ *警告*: ${weather.warningMessage}\n\n`;
    }
    
    // 气温
    if (weather.temperature.length > 0) {
        text += `🌡️ *氣溫* (°C)\n`;
        weather.temperature.slice(0, limit).forEach(t => {
            text += `   • ${t.place}: ${t.value}°C\n`;
        });
        text += '\n';
    }
    
    // 相对湿度
    if (weather.humidity.length > 0) {
        text += `💧 *相對濕度* (%)\n`;
        weather.humidity.slice(0, limit).forEach(h => {
            text += `   • ${h.place}: ${h.value}%\n`;
        });
        text += '\n';
    }
    
    // 降雨量
    const hasRain = weather.rainfall.some(r => (r.max || r.min || 0) > 0);
    if (hasRain) {
        text += `🌧️ *過去一小時降雨* (毫米)\n`;
        weather.rainfall.filter(r => (r.max || r.min || 0) > 0).slice(0, limit).forEach(r => {
            const rain = r.max || r.min || 0;
            text += `   • ${r.place}: ${rain}mm\n`;
        });
        text += '\n';
    }
    
    // 紫外线指数
    if (weather.uvIndex) {
        text += `☀️ *紫外線指數*: ${weather.uvIndex.value} (${weather.uvIndex.desc})\n\n`;
    }
    
    text += `━━━━━━━━━━━━━━━━\n`;
    text += `📡 數據來源: 香港天文台`;
    
    return text;
}

/**
 * 格式化9天预报为可读文本
 * @param {object} forecast - 预报数据
 * @returns {string} 格式化文本
 */
function format9DayForecast(forecast) {
    if (!forecast || !forecast.forecast) {
        return '沒有找到預報數據';
    }
    
    let text = `📅 9天天氣預報\n`;
    text += `━━━━━━━━━━━━━━━━\n`;
    text += `⏰ 更新時間: ${forecast.updateTime}\n\n`;
    
    if (forecast.generalSituation) {
        text += `📝 *概況*:\n${forecast.generalSituation}\n\n`;
    }
    
    forecast.forecast.forEach((day, index) => {
        text += `${index + 1}. *${day.date}* (${day.week})\n`;
        text += `   🌡️ 溫度: ${day.temp.min}-${day.temp.max}${day.temp.unit}\n`;
        text += `   💧 濕度: ${day.humidity.min}-${day.humidity.max}${day.humidity.unit}\n`;
        text += `   🌤️ 天氣: ${day.weather}\n`;
        text += `   💨 風力: ${day.wind}\n\n`;
    });
    
    text += `━━━━━━━━━━━━━━━━\n`;
    text += `📡 數據來源: 香港天文台`;
    
    return text;
}

// 导出函数
module.exports = {
    HKO_DATA_TYPES,
    queryHKOData,
    getCurrentWeather,
    getWeatherByPlace,
    get9DayForecast,
    getWeatherWarnings,
    formatCurrentWeather,
    format9DayForecast
};

// 命令行测试
if (require.main === module) {
    (async () => {
        console.log('🌤️  测试香港天文台 API\n');
        
        try {
            // 测试 1: 获取当前天气
            console.log('1️⃣ 获取当前天气报告...\n');
            const current = await getCurrentWeather();
            console.log(formatCurrentWeather(current));
            
            console.log('\n\n');
            
            // 测试 2: 获取9天预报
            console.log('2️⃣ 获取9天天气预报...\n');
            const forecast = await get9DayForecast();
            console.log(format9DayForecast(forecast));
            
            console.log('\n✅ 测试完成！');
            
        } catch (error) {
            console.error('\n❌ 测试失败:', error.message);
        }
    })();
}
