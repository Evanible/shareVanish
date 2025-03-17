import { useState, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { createContent, getContent, type Content } from './api'
import './App.css'
import RichTextEditor from './components/RichTextEditor'

function App() {
  const [content, setContent] = useState<Content>({
    text: '',
    images: [],
    createdAt: Date.now()
  })
  const [accessCode, setAccessCode] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [notificationMessage, setNotificationMessage] = useState('')
  const [inputAccessCode, setInputAccessCode] = useState('')
  const [isCodeInputFocused, setIsCodeInputFocused] = useState(false) // 跟踪输入框是否被选中
  const [isContentLoaded, setIsContentLoaded] = useState(false) // 用于标记是否通过访问码加载了内容
  const [remainingHours, setRemainingHours] = useState<number | null>(null) // 用于显示内容自动失效剩余时间

  // 计算内容过期剩余时间
  useEffect(() => {
    if (isContentLoaded && content.createdAt) {
      const calculateRemainingTime = () => {
        const now = Date.now()
        // 确保createdAt是数字格式
        const createdAt = typeof content.createdAt === 'string' 
          ? new Date(content.createdAt).getTime() 
          : content.createdAt
        
        if (isNaN(createdAt)) {
          setRemainingHours(24) // 默认显示24小时
          return
        }
        
        const expiryTimeMs = createdAt + 24 * 60 * 60 * 1000 // 24小时后过期
        const remainingMs = expiryTimeMs - now
        const remainingHrs = Math.max(0, Math.ceil(remainingMs / (60 * 60 * 1000)))
        setRemainingHours(remainingHrs)
      }

      calculateRemainingTime()
      const timer = setInterval(calculateRemainingTime, 60 * 1000) // 每分钟更新一次
      
      return () => clearInterval(timer)
    }
  }, [isContentLoaded, content.createdAt])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif']
    },
    maxSize: 3 * 1024 * 1024, // 3MB
    maxFiles: 10,
    onDrop: async (acceptedFiles) => {
      if (content.images.length + acceptedFiles.length > 10) {
        setError('最多只能上传10张图片')
        return
      }

      const newImages = await Promise.all(
        acceptedFiles.map(async (file) => {
          const reader = new FileReader()
          return new Promise<string>((resolve) => {
            reader.onload = () => resolve(reader.result as string)
            reader.readAsDataURL(file)
          })
        })
      )

      setContent(prev => ({
        ...prev,
        images: [...prev.images, ...newImages]
      }))
    }
  })

  const handleTextChange = (newText: string) => {
    if (newText.length > 10000) {
      setError('文本长度不能超过10000字')
      return
    }
    setContent(prev => ({ ...prev, text: newText }))
    setError('')
  }

  const handleImageUpload = (imageDataUrl: string) => {
    if (content.images.length >= 10) {
      setError('最多只能上传10张图片')
      return false
    }

    setContent(prev => ({
      ...prev,
      images: [...prev.images, imageDataUrl]
    }))
    return true
  }

  const generateAndCopyAccessCode = async () => {
    setIsLoading(true)
    setError('')
    
    try {
      const response = await createContent(content)
      if (response.success && response.data) {
        const newAccessCode = response.data.accessCode
        setAccessCode(newAccessCode)
        setInputAccessCode(newAccessCode) // 自动填充到输入框
        
        // 复制到剪贴板
        navigator.clipboard.writeText(newAccessCode)
        setNotificationMessage('访问码已复制到剪贴板')
        setTimeout(() => setNotificationMessage(''), 3000) // 3秒后清除提示
      } else {
        setError(response.error || '生成访问码失败')
      }
    } catch (error) {
      setError('生成访问码失败')
    } finally {
      setIsLoading(false)
    }
  }

  const handleFetchContent = async () => {
    if (!inputAccessCode || inputAccessCode.length < 4) return
    
    // 如果输入的访问码与当前正在编辑的内容访问码相同，不执行任何操作
    if (isContentLoaded && inputAccessCode === accessCode) return
    
    setIsLoading(true)
    setError('')
    
    try {
      const response = await getContent(inputAccessCode)
      if (response.success && response.data) {
        setContent(response.data)
        setAccessCode(inputAccessCode)
        setIsContentLoaded(true)
      } else {
        setError(response.error || '获取内容失败')
      }
    } catch (error) {
      setError('获取内容失败')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAccessCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputAccessCode(e.target.value)
  }

  const handleCreateNewContent = () => {
    // 重置为创建新内容模式
    setContent({
      text: '',
      images: [],
      createdAt: Date.now()
    })
    setAccessCode('')
    setInputAccessCode('')
    setIsContentLoaded(false)
    setRemainingHours(null)
  }

  // 访问码输入框按回车键触发提取
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && inputAccessCode.length === 4) {
      e.preventDefault()
      handleFetchContent()
    }
  }

  // 判断提取按钮是否应该禁用
  const shouldDisableFetchButton = () => {
    return inputAccessCode.length < 4 || 
           isLoading
  }

  // 处理访问码输入框的焦点
  const handleCodeInputFocus = () => {
    setIsCodeInputFocused(true)
    document.getElementById('accessCodeInput')?.focus()
  }

  // 处理访问码输入框失去焦点
  const handleCodeInputBlur = () => {
    setIsCodeInputFocused(false)
  }

  // 获取特定输入框的样式
  const getInputBoxStyle = (position: number) => {
    const baseClasses = "w-14 h-14 text-center text-xl rounded-md cursor-pointer ";
    if (isCodeInputFocused) {
      // 只有当前输入位置的框高亮，其他保持默认
      if (inputAccessCode.length === position) {
        return baseClasses + "border-2 border-blue-500 shadow-sm";
      }
      // 已输入的框保持默认样式，只是边框颜色略深
      if (position < inputAccessCode.length) {
        return baseClasses + "border border-gray-400";
      }
      // 未输入的框保持默认样式
      return baseClasses + "border border-gray-300";
    }
    // 未选中状态
    return baseClasses + "border hover:border-gray-400";
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center overflow-hidden">
      {/* 顶部访问码输入和按钮区域 - 固定在顶部 */}
      <div className="fixed top-0 left-0 right-0 bg-white p-4 z-10 shadow-md">
        {/* 内容容器，固定宽度 */}
        <div className="w-[1024px] mx-auto">
          <div className="flex items-center justify-between">
            {/* 左侧：提取码输入框 */}
            <div className="grid grid-cols-4 gap-2 w-[240px]">
              <input
                type="text"
                maxLength={1}
                value={inputAccessCode.charAt(0) || ''}
                readOnly
                className={getInputBoxStyle(0)}
                onClick={handleCodeInputFocus}
              />
              <input
                type="text"
                maxLength={1}
                value={inputAccessCode.charAt(1) || ''}
                readOnly
                className={getInputBoxStyle(1)}
                onClick={handleCodeInputFocus}
              />
              <input
                type="text"
                maxLength={1}
                value={inputAccessCode.charAt(2) || ''}
                readOnly
                className={getInputBoxStyle(2)}
                onClick={handleCodeInputFocus}
              />
              <input
                type="text"
                maxLength={1}
                value={inputAccessCode.charAt(3) || ''}
                readOnly
                className={getInputBoxStyle(3)}
                onClick={handleCodeInputFocus}
              />
            </div>
            <input
              id="accessCodeInput"
              type="text"
              className="absolute opacity-0 h-0"
              value={inputAccessCode}
              onChange={handleAccessCodeChange}
              onKeyPress={handleKeyPress}
              onFocus={() => setIsCodeInputFocused(true)}
              onBlur={handleCodeInputBlur}
              maxLength={4}
            />
            
            {/* 右侧：按钮垂直排列 */}
            <div className="flex flex-col gap-2 w-[200px]">
              {isContentLoaded ? (
                <button
                  className="btn btn-primary w-full"
                  onClick={handleCreateNewContent}
                >
                  创建新内容
                </button>
              ) : (
                <button
                  className="btn btn-primary w-full"
                  onClick={generateAndCopyAccessCode}
                  disabled={isLoading}
                >
                  {isLoading ? '生成中...' : '生成访问码并复制'}
                </button>
              )}
              
              <button
                className={`btn w-full ${inputAccessCode.length === 4 ? 'btn-primary' : 'btn-secondary'}`}
                onClick={handleFetchContent}
                disabled={shouldDisableFetchButton()}
              >
                提取
              </button>
            </div>
          </div>
          
          {/* 通知、提示和错误信息 - 只有内容存在时才占用空间 */}
          <div className={`mt-1 ${(notificationMessage || (isContentLoaded && remainingHours !== null) || error) ? 'h-8' : 'h-0'}`}>
            {notificationMessage && (
              <div className="text-green-600 font-medium">
                {notificationMessage}
              </div>
            )}
            
            {isContentLoaded && remainingHours !== null && (
              <div className="text-blue-600">
                <p>正在编辑通过访问码获取的内容。该内容自动失效时间：{remainingHours}小时后</p>
              </div>
            )}
            
            {error && (
              <div className="text-red-500">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* 内容区域，动态调整与顶部的距离 */}
      <div 
        className={`w-[1024px] fixed bottom-auto flex flex-col overflow-visible ${
          (notificationMessage || (isContentLoaded && remainingHours !== null) || error) 
            ? 'top-[6.5rem] mt-[6.5rem]' 
            : 'top-[5.5rem] mt-[5.5rem]'
        }`}
      >
        {/* 内容编辑区域 */}
        <div className="h-auto flex flex-col">
          {/* 富文本编辑器组件 */}
          <div className="h-[600px] mb-6 overflow-visible">
            <RichTextEditor 
              initialValue={content.text}
              onChange={handleTextChange}
              onImageUpload={handleImageUpload}
              isReadOnly={false}
            />
          </div>
          
          {/* 图片上传区域 - 直接放在编辑器下方 */}
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer mb-4
              ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}
          >
            <input {...getInputProps()} />
            <p>拖拽图片到此处，或点击选择图片</p>
            <p className="text-sm text-gray-500 mt-2">
              最多上传10张图片，每张不超过3MB
            </p>
            {content.images.length > 0 && (
              <div className="text-sm text-blue-500 mt-2">
                已上传 {content.images.length}/10 张图片
              </div>
            )}
          </div>

          {/* 图片预览区域 */}
          {content.images.length > 0 && (
            <div className="mb-4">
              <div className="grid grid-cols-2 gap-4">
                {content.images.map((image, index) => (
                  <img
                    key={index}
                    src={image}
                    alt={`上传图片 ${index + 1}`}
                    className="rounded-lg"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App