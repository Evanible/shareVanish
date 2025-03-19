import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { contentRouter } from './routes/content.js'
import mongoose from 'mongoose'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config()

const app = express()
const port = process.env.PORT || 3000

// 连接到MongoDB
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/shareVanish"

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log("成功连接到MongoDB数据库")
  })
  .catch((error) => {
    console.error("MongoDB连接失败:", error)
  })

// 中间件
app.use(cors())
app.use(express.json({ limit: '10mb' }))

// 路由
app.use('/api/content', contentRouter)

// 启动服务器，监听所有网络接口
app.listen(Number(port), '0.0.0.0', () => {
  console.log(`Server is running on port ${port}`)
  console.log(`可从局域网访问: http://YOUR_IP:${port}`)
}) 