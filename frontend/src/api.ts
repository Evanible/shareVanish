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
  const secretKey = generateSecretKey(accessCode)
  const bytes = CryptoJS.AES.decrypt(encryptedData, secretKey)
  const decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8))
  return {
    text: decryptedData.text,
    images: decryptedData.images,
    createdAt: Date.now() // 使用当前时间，因为解密后无法获取原始创建时间
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
    const data = await response.json()
    
    if (!response.ok) {
      throw new Error(data.error || '服务器错误')
    }
    
    // 如果请求成功，解密内容
    if (data.success && data.data && data.data.encryptedData) {
      try {
        const decryptedContent = decryptContent(data.data.encryptedData, accessCode)
        
        // 创建新的响应对象，包含解密后的内容
        return {
          success: true,
          data: {
            ...decryptedContent,
            createdAt: data.data.createdAt // 使用服务器返回的创建时间
          }
        }
      } catch (decryptError) {
        console.error('内容解密失败:', decryptError)
        return {
          success: false,
          error: '内容解密失败，可能是访问码错误'
        }
      }
    }
    
    return data
  } catch (error) {
    console.error('获取内容失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '获取内容失败'
    }
  }
}