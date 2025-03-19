import CryptoJS from 'crypto-js'

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
    console.log(`JSON字符串大小: ${(contentStr.length / 1024 / 1024).toFixed(2)}MB`)
    
    return CryptoJS.AES.encrypt(contentStr, secretKey).toString()
  } catch (error) {
    console.error('内容加密失败:', error)
    throw new Error('内容加密失败')
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
    
    // 确保返回的数据包含所有必要的字段
    return {
      text: typeof decryptedData.text === 'string' ? decryptedData.text : '',
      images: Array.isArray(decryptedData.images) ? decryptedData.images : [],
      createdAt: Date.now() // 使用当前时间，因为解密后无法获取原始创建时间
    }
  } catch (error) {
    console.error('解密内容错误:', error)
    // 解密失败时抛出错误，让调用方处理错误
    throw new Error(error instanceof Error ? 
      `解密内容失败: ${error.message}` : 
      '解密内容失败，请确认访问码是否正确')
  }
}

// 添加统一的请求头配置
const headers = {
  'Content-Type': 'application/json',
  'Accept': 'application/json'
};

export const createContent = async (content: Content): Promise<ApiResponse<{ accessCode: string }>> => {
  try {
    console.log('准备创建内容...')
    
    // 首先从服务器获取访问码
    const codeResponse = await fetch(`${API_BASE_URL}/content/accessCode`, {
      method: 'POST',
      headers
    })
    
    // 打印响应状态用于调试
    console.log('访问码API响应状态:', codeResponse.status)
    
    const codeData = await codeResponse.json()
    if (!codeResponse.ok) {
      throw new Error(codeData.error || '获取访问码失败')
    }
    
    const accessCode = codeData.data.accessCode
    console.log('获取到服务器生成的访问码:', accessCode)
    
    // 使用服务器生成的访问码加密内容
    const encryptedData = encryptContent(content, accessCode)
    
    // 创建要发送的数据
    const payload = {
      accessCode,  // 包含服务器生成的访问码
      encryptedData,
      createdAt: content.createdAt
    }
    
    // 发送创建内容的请求
    const contentResponse = await fetch(`${API_BASE_URL}/content`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })
    
    // 打印响应状态用于调试
    console.log('创建内容API响应状态:', contentResponse.status)
    
    const data = await contentResponse.json()
    if (!contentResponse.ok) {
      throw new Error(data.error || '创建内容失败')
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
    const response = await fetch(`${API_BASE_URL}/content/${accessCode}`, {
      headers
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
        
        return {
          success: true,
          data: {
            ...decryptedContent,
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
    
    // 使用访问码加密内容
    const encryptedData = encryptContent(content, accessCode)
    
    const response = await fetch(`${API_BASE_URL}/content/${accessCode}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        encryptedData,
        createdAt: content.createdAt
      })
    })
    
    // 打印响应状态用于调试
    console.log('更新内容API响应状态:', response.status)
    
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || '更新内容失败')
    }
    
    if (data.success) {
      console.log('内容更新成功')
      return {
        success: true,
        data: { 
          accessCode,
          createdAt: content.createdAt // 返回createdAt时间
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