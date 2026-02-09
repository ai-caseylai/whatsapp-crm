# 人臉識別功能實現方案

## 📋 可用的人臉識別服務

### 1. Amazon Rekognition（推薦 - 最強大）
- **功能**：
  - 人臉檢測與識別
  - 人臉比對
  - 名人識別
  - 年齡、性別、情緒識別
- **成本**：前 1000 張免費/月，之後 $1/1000 張
- **優點**：準確度高，功能全面
- **缺點**：需要 AWS 帳戶

### 2. Microsoft Azure Face API
- **功能**：
  - 人臉檢測與驗證
  - 人臉分組
  - 相似臉孔搜索
- **成本**：前 30,000 次/月免費
- **優點**：免費額度充足
- **缺點**：需要 Azure 帳戶

### 3. Google Cloud Vision API
- **功能**：
  - 人臉檢測
  - 標籤檢測
  - OCR（文字識別）
- **成本**：前 1000 張免費/月
- **優點**：與 Google 生態系統整合好
- **缺點**：人臉識別功能較基礎

### 4. Face++ (旷视科技)
- **功能**：
  - 人臉檢測與識別
  - 人臉比對
  - 人臉搜索
- **成本**：有免費額度
- **優點**：亞洲人臉識別準確度高
- **缺點**：中國服務，可能有網絡延遲

## 🎯 推薦實現方案

### 方案 1：使用 Gemini Vision + 文字描述（已有）
**當前可用** - 您已經在使用的方式

```javascript
// 使用 Gemini 描述圖片中的人物
const description = await analyzeImageWithGemini(imagePath);
// 例如："一位穿藍色衣服的男性在帆船上"

// 然後可以搜索：
"穿藍色衣服的男性"
"戴帽子的女性"
"多人合照"
```

**優點**：
- ✅ 已經實現
- ✅ 可以描述人物特徵
- ✅ 支持自然語言搜索

**缺點**：
- ❌ 不能識別具體是誰
- ❌ 不能按人臉特徵搜索
- ❌ 無法人臉比對

### 方案 2：整合 AWS Rekognition（推薦）
**最專業的人臉識別方案**

功能包括：
1. **人臉檢測** - 自動找出圖片中的所有人臉
2. **人臉索引** - 為每個人臉創建唯一 ID
3. **人臉搜索** - 找出同一個人的所有照片
4. **人臉分組** - 自動將相同的人分到一組

**成本**：
- 前 1000 張免費/月
- 之後 $1/1000 張
- 處理 1718 張圖片：約 $0.72（首月免費）

### 方案 3：混合方案（推薦）
結合 Gemini Vision + Face Recognition

```
圖片 → Gemini (描述場景、活動、物品)
     → Face Recognition (識別具體人物)
     → 合併結果存入知識庫
```

這樣可以：
- 搜索場景："帆船活動"
- 搜索人物："張三的照片"
- 搜索組合："張三在帆船上"

## 💻 實現代碼示例

### 使用 AWS Rekognition

```javascript
const AWS = require('aws-sdk');
const rekognition = new AWS.Rekognition({
  region: 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

// 創建人臉集合
async function createFaceCollection() {
  await rekognition.createCollection({
    CollectionId: 'whatsapp-crm-faces'
  }).promise();
}

// 索引人臉
async function indexFaces(imagePath, personName) {
  const imageBuffer = fs.readFileSync(imagePath);
  
  const result = await rekognition.indexFaces({
    CollectionId: 'whatsapp-crm-faces',
    Image: { Bytes: imageBuffer },
    ExternalImageId: personName,
    DetectionAttributes: ['ALL']
  }).promise();
  
  return result.FaceRecords;
}

// 搜索人臉
async function searchFaces(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  
  const result = await rekognition.searchFacesByImage({
    CollectionId: 'whatsapp-crm-faces',
    Image: { Bytes: imageBuffer },
    MaxFaces: 10,
    FaceMatchThreshold: 80
  }).promise();
  
  return result.FaceMatches;
}
```

### 使用 Face++ API

```javascript
const FormData = require('form-data');

async function detectFaces(imagePath) {
  const form = new FormData();
  form.append('api_key', process.env.FACEPP_API_KEY);
  form.append('api_secret', process.env.FACEPP_API_SECRET);
  form.append('image_file', fs.createReadStream(imagePath));
  form.append('return_attributes', 'gender,age,emotion');
  
  const response = await fetch('https://api-us.faceplusplus.com/facepp/v3/detect', {
    method: 'POST',
    body: form
  });
  
  return await response.json();
}
```

## 📝 實現步驟

### 階段 1：評估需求
1. 確定需要識別多少人？
2. 需要什麼功能？
   - 只是分組？
   - 還要識別具體是誰？
   - 需要統計每個人出現的次數？

### 階段 2：選擇服務
根據需求和預算選擇：
- **預算充足** → AWS Rekognition（最專業）
- **免費優先** → Azure Face API（免費額度最多）
- **亞洲臉孔** → Face++（準確度高）

### 階段 3：實現整合
1. 註冊 API 服務
2. 創建處理腳本
3. 批量處理圖片
4. 建立人臉索引
5. 實現搜索功能

### 階段 4：優化體驗
1. 為每個人物添加標籤
2. 自動分組相似人臉
3. 創建人物相簿
4. 統計出現頻率

## 🎯 建議

**如果您想要**：
1. **簡單的人物描述** → 繼續使用 Gemini（已有）
2. **專業的人臉識別** → 使用 AWS Rekognition
3. **按人物搜索照片** → 混合方案

**下一步**：
1. 確認是否需要人臉識別功能
2. 如果需要，我可以幫您實現完整的人臉識別系統
3. 估計成本和時間

## 💰 成本對比

| 服務 | 免費額度 | 付費價格 | 處理 1718 張成本 |
|------|---------|---------|----------------|
| AWS Rekognition | 1000/月 | $1/1000 | $0.72（首月免費）|
| Azure Face API | 30000/月 | $1/1000 | 免費 |
| Google Vision | 1000/月 | $1.50/1000 | $1.08 |
| Face++ | 有限額度 | 按次計費 | ~$1-2 |

## 📚 相關資源

- AWS Rekognition: https://aws.amazon.com/rekognition/
- Azure Face API: https://azure.microsoft.com/zh-tw/services/cognitive-services/face/
- Google Cloud Vision: https://cloud.google.com/vision
- Face++: https://www.faceplusplus.com.cn/
