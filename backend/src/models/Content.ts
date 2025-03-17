import mongoose from 'mongoose'

const contentSchema = new mongoose.Schema({
  accessCode: {
    type: String,
    required: true,
    unique: true
  },
  encryptedData: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
    expires: 86400 // 24小时后自动删除
  }
})

export const Content = mongoose.model('Content', contentSchema)