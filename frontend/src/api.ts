const API_BASE_URL = 'http://localhost:3000/api'
import CryptoJS from 'crypto-js'

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
  const secretKey = generateSecretKey(accessCode)
  const contentStr = JSON.stringify({
    text: content.text,
    images: content.images
  })
  return CryptoJS.AES.encrypt(contentStr, secretKey).toString()
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

export const createContent = async (content: Content): Promise<ApiResponse<{ accessCode: string }>> => {
  try {
    console.log('准备创建内容...')
    
    // 首先从服务器获取访问码
    const codeResponse = await fetch(`${API_BASE_URL}/content/accessCode`, {
      method: 'POST'
    })
    
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
    
    console.log('发送加密内容到服务器...')
    const response = await fetch(`${API_BASE_URL}/content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    
    const data = await response.json()
    console.log('收到服务器响应:', data)
    
    if (!response.ok) {
      throw new Error(data.error || '服务器错误')
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
    const response = await fetch(`${API_BASE_URL}/content/${accessCode}`)
    
    // 检查HTTP状态
    if (!response.ok) {
      const errorText = await response.text()
      console.error('获取内容HTTP错误:', response.status, errorText)
      return {
        success: false,
        error: `服务器错误 (${response.status}): ${errorText}`
      }
    }
    
    const data = await response.json()
    console.log('服务器响应:', JSON.stringify(data).substring(0, 100) + '...')
    
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
): Promise<ApiResponse<{ accessCode: string }>> => {
  try {
    console.log('准备更新内容，访问码:', accessCode.slice(0, 2) + '**')
    
    // 加密内容
    const encryptedData = encryptContent(content, accessCode)
    
    // 发送更新请求
    const response = await fetch(`${API_BASE_URL}/content/${accessCode}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ encryptedData }),
    })
    
    // 处理错误
    if (!response.ok) {
      const errorText = await response.text()
      console.error('更新内容HTTP错误:', response.status, errorText)
      return {
        success: false,
        error: `服务器错误 (${response.status}): ${errorText}`
      }
    }
    
    // 解析响应
    const data = await response.json()
    
    if (data.success) {
      console.log('内容更新成功')
      return {
        success: true,
        data: { accessCode }
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