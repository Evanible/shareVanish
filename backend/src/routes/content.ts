import express from 'express'
import { nanoid } from 'nanoid'
import { Content } from '../models/Content.js'

const router = express.Router()

// 获取新访问码（不创建内容）
router.post('/accessCode', async (req, res) => {
  try {
    const accessCode = nanoid(4)
    console.log('生成新访问码:', accessCode)
    
    res.json({
      success: true,
      data: {
        accessCode
      }
    })
  } catch (error) {
    console.error('生成访问码失败:', error)
    res.status(500).json({
      success: false,
      error: '生成访问码失败'
    })
  }
})

// 创建新内容
router.post('/', async (req, res) => {
  try {
    console.log('收到创建内容请求:', req.body)
    const { accessCode, encryptedData, createdAt } = req.body
    
    // 确保提供了访问码
    if (!accessCode) {
      return res.status(400).json({
        success: false,
        error: '缺少访问码'
      })
    }
    
    // 创建新内容
    const newContent = new Content({
      accessCode,
      encryptedData,
      createdAt: new Date(createdAt)
    })
    
    // 保存到数据库
    await newContent.save()
    
    console.log('内容创建成功，访问码:', accessCode)
    
    res.json({
      success: true,
      data: {
        accessCode
      }
    })
  } catch (error) {
    console.error('创建内容时发生错误:', error)
    res.status(500).json({
      success: false,
      error: '创建内容失败'
    })
  }
})

// 获取内容
router.get('/:accessCode', async (req, res) => {
  try {
    const { accessCode } = req.params
    console.log('收到获取内容请求，访问码:', accessCode)
    
    // 从数据库查找内容
    const content = await Content.findOne({ accessCode })
    
    if (!content) {
      console.log('内容不存在或已过期，访问码:', accessCode)
      return res.status(404).json({
        success: false,
        error: '内容不存在或已过期'
      })
    }
    
    console.log('成功获取内容，访问码:', accessCode)
    res.json({
      success: true,
      data: {
        encryptedData: content.encryptedData,
        createdAt: content.createdAt
      }
    })
  } catch (error) {
    console.error('获取内容时发生错误:', error)
    res.status(500).json({
      success: false,
      error: '获取内容失败'
    })
  }
})

// 更新内容
router.put('/:accessCode', async (req, res) => {
  try {
    const { accessCode } = req.params
    const { encryptedData } = req.body
    
    console.log('收到更新内容请求，访问码:', accessCode)
    
    // 确保提供了加密数据
    if (!encryptedData) {
      return res.status(400).json({
        success: false,
        error: '缺少加密数据'
      })
    }
    
    // 从数据库查找内容
    const content = await Content.findOne({ accessCode })
    
    if (!content) {
      console.log('要更新的内容不存在，访问码:', accessCode)
      return res.status(404).json({
        success: false,
        error: '内容不存在或已过期'
      })
    }
    
    // 更新内容
    content.encryptedData = encryptedData
    
    // 保存到数据库
    await content.save()
    
    console.log('内容更新成功，访问码:', accessCode)
    
    res.json({
      success: true,
      data: {
        accessCode
      }
    })
  } catch (error) {
    console.error('更新内容时发生错误:', error)
    res.status(500).json({
      success: false,
      error: '更新内容失败'
    })
  }
})

export const contentRouter = router