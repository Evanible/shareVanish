import { useState, useEffect, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { createContent, getContent, type Content, updateContent, type ApiResponse } from './api'
import './App.css'
import RichTextEditor from './components/RichTextEditor'
// 更新标记：强制浏览器加载新版本 - v1.0.1
import './test.css'

function App() {
  // 状态管理
  const [content, setContent] = useState<Content>({
    text: '',
    images: [],
    createdAt: Date.now()
  })
  const [accessCode, setAccessCode] = useState('')
  const [inputAccessCode, setInputAccessCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isCodeInputFocused, setIsCodeInputFocused] = useState(false)
  const [isContentLoaded, setIsContentLoaded] = useState(false)
  const [remainingHours, setRemainingHours] = useState<number | null>(null)
  const [isContentModified, setIsContentModified] = useState(false)
  // 添加4个独立的输入框状态
  const [codeInputs, setCodeInputs] = useState(['', '', '', ''])
  // 添加弹窗状态
  const [showPopup, setShowPopup] = useState(false)
  // 添加弹窗错误状态
  const [popupError, setPopupError] = useState('')
  // 添加通知消息状态
  const [notificationMessage, setNotificationMessage] = useState('')
  // 弹窗引用，用于检测外部点击
  const popupRef = useRef<HTMLDivElement>(null)

  // 添加全局键盘事件以支持Enter键快速提取
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // 按ESC键关闭弹窗
      if (e.key === 'Escape' && showPopup) {
        setShowPopup(false);
        setPopupError('');
        setCodeInputs(['', '', '', '']);
      }
      
      // 保留原有的Enter键功能，但仅在访问码输入框有焦点时触发
      if (e.key === 'Enter' && inputAccessCode.length === 4 && !isLoading && isCodeInputFocused) {
        // 防止事件冒泡导致编辑器中回车问题
        e.preventDefault();
        handleFetchContent();
      }
      
      // 完全阻止编辑器外的回车键触发保存按钮状态变化
      if (e.key === 'Enter') {
        // 检查焦点是否在编辑器内
        const activeElement = document.activeElement;
        const isEditorFocused = activeElement?.closest('.ProseMirror') !== null;
        
        // 如果焦点不在编辑器内或访问码输入框内，阻止默认行为
        if (!isEditorFocused && !isCodeInputFocused) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [inputAccessCode, isLoading, isCodeInputFocused, showPopup]);

  // 添加点击外部关闭弹窗功能
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setShowPopup(false);
        setPopupError('');
        setCodeInputs(['', '', '', '']);
      }
    }

    // 只有在弹窗显示时添加事件监听器
    if (showPopup) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showPopup]);

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

  // 处理按键事件，支持退格键回到上一个输入框
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !codeInputs[index] && index > 0) {
      // 当前输入框为空且按下退格键时，返回到上一个输入框
      const prevInput = document.getElementById(`popup-code-input-${index - 1}`);
      if (prevInput) {
        prevInput.focus();
      }
    }
    
    // 当在最后一个输入框按回车键时，执行提取内容
    if (e.key === 'Enter' && index === 3 && codeInputs[3] !== '') {
      handleFetchContentFromPopup();
    }
  };

  // 处理单个输入框变化
  const handleCodeInputChange = (index: number, value: string) => {
    // 检查是否是粘贴的多个字符
    if (value.length > 1) {
      // 可能是粘贴的完整访问码，尝试分配给所有输入框
      if (value.length <= 4) {
        const chars = value.substring(0, 4).split('');
        const newInputs = [...codeInputs];
        
        // 填充当前和后续输入框
        for (let i = 0; i < chars.length && index + i < 4; i++) {
          newInputs[index + i] = chars[i];
        }
        
        setCodeInputs(newInputs);
        setInputAccessCode(newInputs.join(''));
        
        // 自动聚焦到最后一个有值的输入框之后的输入框
        const nextIndex = Math.min(index + value.length, 3);
        const nextInput = document.getElementById(`popup-code-input-${nextIndex}`);
        if (nextInput && nextIndex < 3) {
          nextInput.focus();
        }
        
        // 检查是否所有输入框都已填满
        if (newInputs.every(input => input.trim() !== '')) {
          // 所有输入框都填满了，立即提取内容
          handleFetchContentFromPopup();
        }
        
        return;
      } else {
        // 如果粘贴的内容超过4个字符，只取前4个
        if (index === 0) {
          const chars = value.substring(0, 4).split('');
          const newInputs = chars.concat(''.repeat(4 - chars.length).split(''));
          setCodeInputs(newInputs);
          setInputAccessCode(newInputs.join(''));
          
          // 检查是否所有输入框都已填满
          if (newInputs.every(input => input.trim() !== '')) {
            // 所有输入框都填满了，立即提取内容
            handleFetchContentFromPopup();
          }
          
          return;
        } else {
          value = value.charAt(0); // 如果不是在第一个框，只保留第一个字符
        }
      }
    }
    
    const newInputs = [...codeInputs];
    newInputs[index] = value; // 保持原始大小写，不转换为大写
    setCodeInputs(newInputs);
    
    // 更新总的访问码
    const newAccessCode = newInputs.join('');
    setInputAccessCode(newAccessCode);
    
    // 自动focus到下一个输入框
    if (value && index < 3) {
      const nextInput = document.getElementById(`popup-code-input-${index + 1}`);
      if (nextInput) {
        nextInput.focus();
      }
    }

    // 检查是否所有输入框都已填满
    if (newInputs.every(input => input.trim() !== '')) {
      // 所有输入框都填满了，立即提取内容
      handleFetchContentFromPopup();
    }
  };

  // 处理获取内容
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

  // 修改为在弹窗中提取内容
  const handleFetchContentFromPopup = async () => {
    if (inputAccessCode.length !== 4 || isLoading) return;
    
    setIsLoading(true);
    setPopupError('');
    
    try {
      const response = await getContent(inputAccessCode);
      if (response.success && response.data) {
        // 成功获取内容
        setContent(response.data);
        setAccessCode(inputAccessCode);
        setIsContentLoaded(true);
        setIsContentModified(false);
        
        // 计算剩余时间
        const hoursRemaining = calculateRemainingHours(response.data.createdAt);
        setRemainingHours(hoursRemaining);
        
        // 关闭弹窗
        setShowPopup(false);
      } else {
        // 获取失败，显示错误
        setPopupError(response.error || '访问码不正确或内容已过期');
      }
    } catch (err) {
      console.error('提取内容失败:', err);
      setPopupError('提取内容失败，请检查访问码是否正确');
    } finally {
      setIsLoading(false);
    }
  };

  // 打开弹窗
  const handleOpenPopup = () => {
    setShowPopup(true);
    setCodeInputs(['', '', '', '']);
    setInputAccessCode('');
    setPopupError('');
    // 短暂延迟后聚焦到第一个输入框
    setTimeout(() => {
      const firstInput = document.getElementById('popup-code-input-0');
      if (firstInput) {
        firstInput.focus();
      }
    }, 100);
  };

  // 计算内容过期剩余时间
  const calculateRemainingHours = (createdAt: number): number => {
    const now = Date.now()
    const expirationTime = createdAt + 24 * 60 * 60 * 1000 // 24小时后过期
    const remainingTime = Math.max(0, expirationTime - now)
    return Math.ceil(remainingTime / (60 * 60 * 1000))
  }

  // 处理复制访问码
  const handleCopyCode = () => {
    if (navigator.clipboard && accessCode) {
      navigator.clipboard.writeText(accessCode)
        .then(() => {
          // 复制成功提示
          setNotificationMessage('访问码已复制到剪贴板')
          // 3秒后清除通知
          setTimeout(() => setNotificationMessage(''), 3000)
        })
        .catch(err => {
          console.error('复制失败:', err)
          setNotificationMessage('复制失败，请手动复制')
          // 3秒后清除通知
          setTimeout(() => setNotificationMessage(''), 3000)
        })
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
        // 不再显示保存成功提示
        setIsContentModified(false)
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
        
        // 自动复制访问码到剪贴板
        if (navigator.clipboard) {
          try {
            await navigator.clipboard.writeText(newAccessCode)
            setNotificationMessage(`已成功创建并复制访问码 <code class="access-code">${newAccessCode}</code>`)
          } catch (err) {
            console.error('复制失败:', err)
            setNotificationMessage(`已成功创建访问码 <code class="access-code">${newAccessCode}</code>`)
          }
        } else {
          setNotificationMessage(`已成功创建访问码 <code class="access-code">${newAccessCode}</code>`)
        }
        
        // 5秒后清除通知
        setTimeout(() => {
          setNotificationMessage('')
        }, 5000)
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
    
    // 解决回车键导致内容状态变化的问题
    const activeElement = document.activeElement;
    const isEditorFocused = activeElement?.closest('.ProseMirror') !== null;
    
    // 只有当编辑器获得焦点时才标记内容已修改
    // 这避免了全局回车键导致内容状态意外变化
    if (isEditorFocused) {
      setIsContentModified(true);
    }
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

  // 渲染
  return (
    <div className="app-container">
      {/* 页头 */}
      <header>
        <div className="header-container">
          {/* 左侧状态区域 */}
          <div className="status-container">
            {isContentLoaded ? (
              <div className="status-text">
                正在查看 <code className="access-code">{accessCode}</code>
                {remainingHours !== null && (
                  <span className="timer-info">
                    （将在 <span className="timer">{remainingHours}</span> 小时后过期）
                  </span>
                )}
              </div>
            ) : notificationMessage ? (
              <div className="status-text" dangerouslySetInnerHTML={{ __html: notificationMessage }}></div>
            ) : (
              <div className="status-text"></div>
            )}
          </div>
          
          {/* 右侧按钮区域 */}
          <div className="action-container">
            {isContentLoaded ? (
              <>
                <button 
                  onClick={handleUpdateContent} 
                  disabled={isLoading || !isContentModified}
                  className="action-button"
                >
                  {isLoading ? '处理中...' : '保存'}
                </button>
                
                <button 
                  onClick={handleClear}
                  className="action-button"
                >
                  创建新文档
                </button>
              </>
            ) : (
              <button 
                onClick={handleCreateContent} 
                disabled={isLoading}
                className="action-button"
              >
                {isLoading ? '处理中...' : '创建访问码'}
              </button>
            )}
            
            {/* 提取已有内容按钮始终显示 */}
            <button 
              onClick={handleOpenPopup}
              className="action-button extract-button"
            >
              提取已有内容
            </button>
          </div>
        </div>
      </header>

      {/* 访问码提取弹窗 */}
      {showPopup && (
        <div className="popup-overlay">
          <div className="popup-container" ref={popupRef}>
            <h2>输入访问码</h2>
            <div className="popup-code-inputs">
              {codeInputs.map((code, index) => (
                <input
                  key={index}
                  id={`popup-code-input-${index}`}
                  type="text"
                  maxLength={1}
                  value={code}
                  onChange={(e) => handleCodeInputChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onFocus={() => setIsCodeInputFocused(true)}
                  onBlur={() => setIsCodeInputFocused(false)}
                  className="code-input"
                  disabled={isLoading}
                />
              ))}
            </div>
            
            {isLoading && <div className="loading-indicator">加载中...</div>}
            
            {popupError && (
              <div className="popup-error">{popupError}</div>
            )}
            
            <div className="popup-hint">
              输入完成后将自动提取内容，或按ESC键取消
            </div>
          </div>
        </div>
      )}

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