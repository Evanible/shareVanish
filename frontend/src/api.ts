import CryptoJS from 'crypto-js'

// 配置常量
const MAX_REQUEST_SIZE_MB = 5; // 最大请求大小限制（MB）
const MAX_IMAGE_SIZE_MB = 1; // 单张图片最大大小限制（MB）

// 同时支持本地开发环境和局域网访问
// 注意：在生产环境中应使用相对路径或环境变量
const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000/api'
  : (
    // 本机局域网IP
    window.location.hostname === '192.168.31.99' 
    ? 'http://192.168.31.99:3000/api'
    : window.location.port.startsWith('517') 
    ? 'http://localhost:3000/api' // 处理Vite开发服务器不同端口情况
    : `http://${window.location.hostname}:3000/api`
  )

// 检查API基础URL
console.log('使用API基础URL:', API_BASE_URL)

export interface Content {
  text: string
  images: string[]
  createdAt: number
}

export interface EncryptedContent {
  encryptedData: string
  createdAt: number
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

// 使用访问码作为加密密钥的基础，增加安全性
const generateSecretKey = (accessCode: string): string => {
  return CryptoJS.SHA256(`shareVanish-secret-${accessCode}`).toString()
}

// 加密内容
export const encryptContent = (content: Content, accessCode: string): string => {
  try {
    const secretKey = generateSecretKey(accessCode)
    const contentJson = {
      text: content.text,
      images: content.images
    }
    
    console.log(`准备加密内容: 文本长度=${content.text.length}, 图片数量=${content.images.length}`)
    
    // 检查图片大小以避免超出限制
    const contentStr = JSON.stringify(contentJson)
    const contentSizeMB = (contentStr.length / 1024 / 1024)
    console.log(`JSON字符串大小: ${contentSizeMB.toFixed(2)}MB`)
    
    // 检查请求大小是否超过限制
    if (contentSizeMB > MAX_REQUEST_SIZE_MB) {
      throw new Error(`内容大小(${contentSizeMB.toFixed(2)}MB)超过限制(${MAX_REQUEST_SIZE_MB}MB)，请减少图片数量或使用较小的图片`)
    }
    
    return CryptoJS.AES.encrypt(contentStr, secretKey).toString()
  } catch (error) {
    console.error('内容加密失败:', error)
    throw new Error(error instanceof Error ? error.message : '内容加密失败')
  }
}

// 解密内容
export const decryptContent = (encryptedData: string, accessCode: string): Content => {
  try {
    console.log('开始解密内容，使用访问码:', accessCode.slice(0, 2) + '**')
    const secretKey = generateSecretKey(accessCode)
    const bytes = CryptoJS.AES.decrypt(encryptedData, secretKey)
    const decryptedString = bytes.toString(CryptoJS.enc.Utf8)
    
    if (!decryptedString) {
      console.error('解密结果为空字符串')
      throw new Error('解密后数据为空')
    }
    
    let decryptedData
    try {
      decryptedData = JSON.parse(decryptedString)
      console.log('成功解析JSON数据', 
        { text: decryptedData.text?.substring(0, 20) + '...' || '空', 
          imagesCount: decryptedData.images?.length || 0 
        }
      )
    } catch (jsonError) {
      console.error('JSON解析失败:', jsonError, '解密字符串前20个字符:', decryptedString.substring(0, 20))
      throw new Error('解密数据格式错误')
    }
    
    // 确保返回全新的对象，不受任何现有状态影响
    const freshContent: Content = {
      text: typeof decryptedData.text === 'string' ? decryptedData.text : '',
      images: Array.isArray(decryptedData.images) ? [...decryptedData.images] : [],
      createdAt: Date.now() // 使用当前时间，因为解密后无法获取原始创建时间
    }
    
    console.log('创建了全新的内容对象，文本长度:', freshContent.text.length)
    return freshContent
  } catch (error) {
    console.error('解密内容错误:', error)
    // 解密失败时抛出错误，让调用方处理错误
    throw new Error(error instanceof Error ? 
      `解密内容失败: ${error.message}` : 
      '解密内容失败，请确认访问码是否正确')
  }
}

// 压缩图片Base64字符串
const compressImageDataUrl = async (dataUrl: string, maxSizeMB: number = MAX_IMAGE_SIZE_MB): Promise<string> => {
  return new Promise((resolve, reject) => {
    // 检查输入是否是有效的Data URL
    if (!dataUrl.startsWith('data:image/')) {
      console.warn('无效的图片数据URL');
      return resolve(dataUrl); // 不是图片，直接返回原始数据
    }
    
    // 当前大小（MB）
    const currentSizeMB = (dataUrl.length * 0.75) / (1024 * 1024);
    
    // 如果已经足够小，直接返回
    if (currentSizeMB <= maxSizeMB) {
      console.log(`图片已经足够小 (${currentSizeMB.toFixed(2)}MB <= ${maxSizeMB}MB)`);
      return resolve(dataUrl);
    }
    
    console.log(`压缩前图片大小: ${currentSizeMB.toFixed(2)}MB`);
    
    // 从Data URL创建图片对象
    const img = new Image();
    img.onload = () => {
      // 创建canvas用于压缩
      const canvas = document.createElement('canvas');
      
      // 计算压缩比例
      const scaleFactor = Math.sqrt(maxSizeMB / currentSizeMB);
      
      // 计算新尺寸
      let newWidth = img.width * scaleFactor;
      let newHeight = img.height * scaleFactor;
      
      // 设置canvas尺寸
      canvas.width = newWidth;
      canvas.height = newHeight;
      
      // 绘制图片到canvas
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('无法获取canvas上下文');
        return resolve(dataUrl);
      }
      
      ctx.drawImage(img, 0, 0, newWidth, newHeight);
      
      // 获取压缩后的Data URL (使用0.8的质量)
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
      
      // 计算压缩后大小
      const compressedSizeMB = (compressedDataUrl.length * 0.75) / (1024 * 1024);
      console.log(`压缩后图片大小: ${compressedSizeMB.toFixed(2)}MB`);
      
      resolve(compressedDataUrl);
    };
    
    img.onerror = () => {
      console.error('图片加载失败');
      resolve(dataUrl); // 出错时返回原始数据
    };
    
    img.src = dataUrl;
  });
};

// 压缩内容中的所有图片
const compressContentImages = async (content: Content): Promise<Content> => {
  // 如果没有图片，直接返回原始内容
  if (!content.images || content.images.length === 0) {
    return content;
  }
  
  console.log(`开始压缩 ${content.images.length} 张图片`);
  
  try {
    // 并行压缩所有图片
    const compressedImages = await Promise.all(
      content.images.map(dataUrl => compressImageDataUrl(dataUrl))
    );
    
    // 创建新的内容对象，避免修改原始对象
    return {
      ...content,
      images: compressedImages
    };
  } catch (error) {
    console.error('图片压缩失败:', error);
    return content; // 压缩失败时返回原始内容
  }
};

// 添加统一的请求头配置
const headers = {
  'Content-Type': 'application/json',
  'Accept': 'application/json'
};

export const createContent = async (content: Content): Promise<ApiResponse<{ accessCode: string }>> => {
  try {
    console.log('准备创建内容...')
    
    // 压缩图片
    const compressedContent = await compressContentImages(content)
    console.log('图片压缩完成')
    
    // 首先从服务器获取访问码
    const codeResponse = await fetch(`${API_BASE_URL}/content/accessCode`, {
      method: 'POST',
      headers
    })
    
    // 打印响应状态用于调试
    console.log('访问码API响应状态:', codeResponse.status)
    
    if (!codeResponse.ok) {
      const errorText = await codeResponse.text()
      throw new Error(errorText || `获取访问码失败，状态码: ${codeResponse.status}`)
    }
    
    let codeData
    try {
      codeData = await codeResponse.json()
    } catch (error) {
      throw new Error(`解析访问码响应失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
    
    const accessCode = codeData.data.accessCode
    console.log('获取到服务器生成的访问码:', accessCode)
    
    // 使用服务器生成的访问码加密内容
    const encryptedData = encryptContent(compressedContent, accessCode)
    
    // 创建要发送的数据
    const payload = {
      accessCode,  // 包含服务器生成的访问码
      encryptedData,
      createdAt: compressedContent.createdAt
    }
    
    // 检查请求大小
    const payloadSize = JSON.stringify(payload).length / (1024 * 1024)
    console.log(`请求数据大小: ${payloadSize.toFixed(2)}MB`)
    
    if (payloadSize > MAX_REQUEST_SIZE_MB) {
      throw new Error(`请求大小(${payloadSize.toFixed(2)}MB)超过限制(${MAX_REQUEST_SIZE_MB}MB)，请减少图片数量或使用较小的图片`)
    }
    
    // 发送创建内容的请求
    const contentResponse = await fetch(`${API_BASE_URL}/content`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })
    
    // 打印响应状态用于调试
    console.log('创建内容API响应状态:', contentResponse.status)
    
    if (!contentResponse.ok) {
      // 尝试获取错误信息
      let errorData = '创建内容失败'
      try {
        const errorBody = await contentResponse.text()
        if (errorBody) {
          try {
            const jsonError = JSON.parse(errorBody)
            errorData = jsonError.error || `创建内容失败，状态码: ${contentResponse.status}`
          } catch {
            errorData = errorBody || `创建内容失败，状态码: ${contentResponse.status}`
          }
        }
      } catch (e) {
        errorData = `创建内容失败，状态码: ${contentResponse.status}`
      }
      throw new Error(errorData)
    }
    
    let data
    try {
      data = await contentResponse.json()
    } catch (error) {
      throw new Error('解析创建内容响应失败')
    }
    
    return {
      success: true,
      data: {
        accessCode
      }
    }
  } catch (error) {
    console.error('创建内容失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '创建内容失败'
    }
  }
}

export const getContent = async (accessCode: string): Promise<ApiResponse<Content>> => {
  try {
    console.log('发送获取内容请求，访问码:', accessCode)
    
    // 添加随机数作为缓存破坏参数，确保获取最新数据
    const cacheBreaker = `_cache=${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const response = await fetch(`${API_BASE_URL}/content/${accessCode}?${cacheBreaker}`, {
      headers,
      // 禁用缓存
      cache: 'no-store'
    })
    
    // 打印响应状态用于调试
    console.log('获取内容API响应状态:', response.status)
    
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || '获取内容失败')
    }
    
    // 如果请求成功，解密内容
    if (data.success && data.data && data.data.encryptedData) {
      try {
        console.log('准备解密内容...')
        const decryptedContent = decryptContent(data.data.encryptedData, accessCode)
        
        // 创建完整响应，确保包含createdAt
        const createdAt = data.data.createdAt || Date.now()
        console.log('内容解密成功，创建时间:', new Date(createdAt).toLocaleString())
        
        // 创建全新的对象，确保不会引用旧数据
        return {
          success: true,
          data: {
            text: decryptedContent.text,
            images: [...decryptedContent.images],
            createdAt // 使用服务器返回的创建时间
          }
        }
      } catch (decryptError) {
        console.error('内容解密失败:', decryptError)
        return {
          success: false,
          error: decryptError instanceof Error ? decryptError.message : '内容解密失败，可能是访问码错误'
        }
      }
    } else {
      console.error('服务器返回数据格式不正确:', data)
      return {
        success: false,
        error: data.error || '服务器返回数据格式不正确'
      }
    }
  } catch (error) {
    console.error('获取内容失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '获取内容失败'
    }
  }
}

// 更新已存在的内容
export const updateContent = async (
  content: Content,
  accessCode: string
): Promise<ApiResponse<{ accessCode: string, createdAt: number }>> => {
  try {
    console.log('准备更新内容，访问码:', accessCode.slice(0, 2) + '**')
    
    // 压缩图片
    const compressedContent = await compressContentImages(content)
    console.log('图片压缩完成')
    
    // 强制设置更新时间为当前时间，解决NaN问题
    const currentTime = Date.now();
    console.log('保存内容使用时间戳:', currentTime, new Date(currentTime).toLocaleString());
    
    const updatedContent = {
      ...compressedContent,
      createdAt: currentTime // 强制使用当前时间
    }
    
    // 使用访问码加密内容
    const encryptedData = encryptContent(updatedContent, accessCode)
    
    // 检查请求大小
    const payload = {
      encryptedData,
      createdAt: currentTime // 明确使用最新时间戳
    }
    
    const payloadSize = JSON.stringify(payload).length / (1024 * 1024)
    console.log(`更新请求数据大小: ${payloadSize.toFixed(2)}MB`)
    
    if (payloadSize > MAX_REQUEST_SIZE_MB) {
      throw new Error(`请求大小(${payloadSize.toFixed(2)}MB)超过限制(${MAX_REQUEST_SIZE_MB}MB)，请减少图片数量或使用较小的图片`)
    }
    
    const response = await fetch(`${API_BASE_URL}/content/${accessCode}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload)
    })
    
    // 打印响应状态用于调试
    console.log('更新内容API响应状态:', response.status)
    
    if (!response.ok) {
      // 尝试获取错误信息
      let errorData = '更新内容失败'
      try {
        const errorBody = await response.text()
        if (errorBody) {
          try {
            const jsonError = JSON.parse(errorBody)
            errorData = jsonError.error || `更新内容失败，状态码: ${response.status}`
          } catch {
            errorData = errorBody || `更新内容失败，状态码: ${response.status}`
          }
        }
      } catch (e) {
        errorData = `更新内容失败，状态码: ${response.status}`
      }
      throw new Error(errorData)
    }
    
    let data
    try {
      data = await response.json()
    } catch (error) {
      throw new Error('解析更新内容响应失败')
    }
    
    if (data.success) {
      console.log('内容更新成功，新的createdAt:', new Date(currentTime).toLocaleString())
      return {
        success: true,
        data: { 
          accessCode,
          createdAt: currentTime // 返回新的创建时间
        }
      }
    } else {
      console.error('更新内容失败:', data.error)
      return {
        success: false,
        error: data.error || '更新内容失败'
      }
    }
  } catch (error) {
    console.error('更新内容错误:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '更新内容失败'
    }
  }
}