import { useState, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { createContent, getContent, type Content, updateContent, type ApiResponse } from './api'
import './App.css'
import RichTextEditor from './components/RichTextEditor'
// 更新标记：强制浏览器加载新版本
import './test.css'

function App() {
  // 状态管理
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
  const [isCodeInputFocused, setIsCodeInputFocused] = useState(false)
  const [isContentLoaded, setIsContentLoaded] = useState(false)
  const [remainingHours, setRemainingHours] = useState<number | null>(null)
  const [isContentModified, setIsContentModified] = useState(false)
  // 添加4个独立的输入框状态
  const [codeInputs, setCodeInputs] = useState(['', '', '', ''])

  // 添加全局键盘事件以支持Enter键快速提取
  useEffect(() => {
    const handleGlobalKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && inputAccessCode.length === 4 && !isLoading) {
        e.preventDefault()
        handleFetchContent()
      }
    }
    
    window.addEventListener('keydown', handleGlobalKeyPress)
    return () => window.removeEventListener('keydown', handleGlobalKeyPress)
  }, [inputAccessCode, isLoading])

  // 计算内容过期剩余时间
  useEffect(() => {
    if (isContentLoaded && content.createdAt) {
      const calculateRemainingTime = () => {
        const now = Date.now()
        // 确保createdAt是数字格式
        const createdAt = typeof content.createdAt === 'string' 
          ? new Date(content.createdAt).getTime() 
          : content.createdAt
        
        const expiryTime = createdAt + (24 * 60 * 60 * 1000) // 24小时后过期
        const remainingMs = expiryTime - now
        
        if (remainingMs <= 0) {
          setRemainingHours(0)
          return
        }
        
        // 转换为小时并保留一位小数
        const remainingHoursValue = Math.max(0, parseFloat((remainingMs / (60 * 60 * 1000)).toFixed(1)))
        setRemainingHours(remainingHoursValue)
      }

      calculateRemainingTime()
      const timer = setInterval(calculateRemainingTime, 60000) // 每分钟更新一次
      
      return () => clearInterval(timer)
    }
  }, [isContentLoaded, content.createdAt])

  // 处理单个输入框变化
  const handleCodeInputChange = (index: number, value: string) => {
    if (value.length > 1) {
      value = value.charAt(0); // 每个输入框只允许一个字符
    }
    
    const newInputs = [...codeInputs];
    newInputs[index] = value; // 保持原始大小写
    setCodeInputs(newInputs);
    
    // 更新总的访问码
    const newAccessCode = newInputs.join('');
    setInputAccessCode(newAccessCode);
    
    // 自动focus到下一个输入框
    if (value && index < 3) {
      const nextInput = document.getElementById(`code-input-${index + 1}`);
      if (nextInput) {
        nextInput.focus();
      }
    }
  };

  // 处理内容获取
  const handleFetchContent = async () => {
    if (inputAccessCode.length !== 4 || isLoading) return
    
    setIsLoading(true)
    setError('')
    
    try {
      const response = await getContent(inputAccessCode)
      if (response.success && response.data) {
        setContent(response.data)
        setAccessCode(inputAccessCode)
        setIsContentLoaded(true)
        setIsContentModified(false)
      } else {
        setError(response.error || '获取内容失败')
      }
    } catch (err) {
      // 使用更友好的错误消息
      setError('无法获取内容，请检查访问码是否正确')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  // 处理内容更新
  const handleUpdateContent = async () => {
    if (!accessCode || isLoading) return
    
    setIsLoading(true)
    setError('')
    
    try {
      const response = await updateContent(content, accessCode)
      if (response.success) {
        setNotificationMessage('内容已成功保存')
        setIsContentModified(false)
        
        // 3秒后清除通知
        setTimeout(() => {
          setNotificationMessage('')
        }, 3000)
      } else {
        setError(response.error || '保存内容失败')
      }
    } catch (err) {
      setError('保存内容时发生错误')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  // 处理内容创建
  const handleCreateContent = async () => {
    if (isLoading) return
    
    setIsLoading(true)
    setError('')
    
    try {
      const response = await createContent(content)
      if (response.success && response.data) {
        const newAccessCode = response.data.accessCode
        setAccessCode(newAccessCode)
        
        // 更新4个独立输入框
        const codeArray = newAccessCode.split('')
        setCodeInputs(codeArray.concat(''.repeat(4 - codeArray.length).split('')))
        
        setInputAccessCode(newAccessCode)
        setNotificationMessage(`已创建新内容，访问码：${newAccessCode}`)
        setIsContentLoaded(true)
        setIsContentModified(false)
        
        // 3秒后清除通知
        setTimeout(() => {
          setNotificationMessage('')
        }, 3000)
      } else {
        setError(response.error || '创建内容失败')
      }
    } catch (err) {
      setError('创建内容时发生错误')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  // 处理文本内容变化
  const handleTextChange = (html: string) => {
    setContent(prev => ({ ...prev, text: html }))
    setIsContentModified(true)
  }

  // 处理图片上传
  const handleImageUpload = (dataUrl: string) => {
    // 防止重复添加相同的图片
    if (content.images.includes(dataUrl)) {
      return false
    }
    
    setContent(prev => ({
      ...prev,
      images: [...prev.images, dataUrl]
    }))
    setIsContentModified(true)
    return true
  }

  // 处理图片删除
  const handleImageDelete = (index: number) => {
    setContent(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }))
    setIsContentModified(true)
  }

  // 文件拖放处理
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/*': []
    },
    onDrop: acceptedFiles => {
      // 处理接受的文件
      acceptedFiles.forEach(file => {
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = reader.result as string
          handleImageUpload(dataUrl)
        }
        reader.readAsDataURL(file)
      })
    }
  })

  // 处理清除内容
  const handleClear = () => {
    setContent({
      text: '',
      images: [],
      createdAt: Date.now()
    })
    setAccessCode('')
    setInputAccessCode('')
    setCodeInputs(['', '', '', ''])
    setIsContentLoaded(false)
    setRemainingHours(null)
    setIsContentModified(false)
  }

  // 处理按键事件，支持退格键回到上一个输入框
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !codeInputs[index] && index > 0) {
      const prevInput = document.getElementById(`code-input-${index - 1}`);
      if (prevInput) {
        prevInput.focus();
      }
    }
  };

  // 渲染
  return (
    <div className="app-container">
      {/* 页头 */}
      <header>
        <div className="access-code-container">
          {/* 4个分离的访问码输入框 */}
          <div className="code-inputs">
            {codeInputs.map((code, index) => (
              <input
                key={index}
                id={`code-input-${index}`}
                type="text"
                maxLength={1}
                value={code}
                onChange={(e) => handleCodeInputChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onFocus={() => setIsCodeInputFocused(true)}
                onBlur={() => setIsCodeInputFocused(false)}
                className="code-input"
              />
            ))}
            </div>
              
              <button
                onClick={handleFetchContent}
                disabled={inputAccessCode.length !== 4 || isLoading}
            className="action-button"
              >
            {isLoading ? '加载中...' : '提取'}
              </button>
            </div>
        
        <div className="action-container">
          <button 
            onClick={isContentLoaded ? handleUpdateContent : handleCreateContent} 
            disabled={isLoading || (isContentLoaded && !isContentModified)}
            className="action-button"
          >
            {isLoading ? '处理中...' : isContentLoaded ? '保存内容' : '创建访问码'}
          </button>
            
            {isContentLoaded && remainingHours !== null && (
            <div className="status-indicator">
              有效期: {remainingHours > 0 ? `${remainingHours}小时` : '即将过期'}
              </div>
            )}
        </div>
      </header>

      {/* 主内容区域 */}
      <main>
        {/* 编辑区域 */}
        <section className="editor-section">
            <RichTextEditor 
              initialValue={content.text}
            onChange={handleTextChange}
              onImageUpload={handleImageUpload}
              isReadOnly={false}
            showSaveButton={false}
            onSave={handleUpdateContent}
              isModified={isContentModified}
          />
        </section>

        {/* 图片区域 - 只在有图片或用户开始上传时显示 */}
        {/* 图片上传区 */}
        <div className="upload-section-container">
          <div {...getRootProps()} className="upload-section">
            <input {...getInputProps()} />
            {isDragActive ? (
              <p>拖放图片到这里</p>
            ) : (
              <p>点击或拖放图片到这里上传</p>
            )}
          </div>

          {/* 图片预览区 - 只在有图片时显示 */}
          {content.images.length > 0 && (
            <div className="preview-section">
                {content.images.map((image, index) => (
                <div key={index} className="thumbnail">
                  <img src={image} alt={`上传图片 ${index + 1}`} />
                  <button
                    className="delete-button"
                    onClick={() => handleImageDelete(index)}
                  >
                    ×
        </button>
                  </div>
                ))}
            </div>
          )}
        </div>
      </main>

      {/* 页脚 */}
      <footer>
        <p>安全地分享临时内容</p>
      </footer>

      {/* 通知区域 */}
      {notificationMessage && (
        <div className="notification">
          {notificationMessage}
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="notification" style={{ backgroundColor: "#f44336" }}>
          {error}
      </div>
      )}
    </div>
  )
}

export default App