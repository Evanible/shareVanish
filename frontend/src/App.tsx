import { useState, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { createContent, getContent, type Content, updateContent } from './api'
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
  const [isContentModified, setIsContentModified] = useState(false)

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
      // 检查是否会超过最大图片数量
      const totalImages = content.images.length + acceptedFiles.length
      if (totalImages > 10) {
        setError(`最多只能上传10张图片，当前已有${content.images.length}张，只能再添加${10 - content.images.length}张`)
        // 如果有部分图片可以添加，则继续处理有效部分
        acceptedFiles = acceptedFiles.slice(0, 10 - content.images.length)
        if (acceptedFiles.length === 0) return
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

      // 添加到内容中 - 仅更新拖拽区，不同步到编辑器
      setContent(prev => ({
        ...prev,
        images: [...prev.images, ...newImages]
      }))
      
      // 不再将拖拽上传的图片插入编辑器
      // 这样保持拖拽区和编辑器的单向同步：编辑器->拖拽区
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

  // 处理编辑器中图片的同步
  const syncImagesFromEditor = (editorImages: string[]) => {
    console.log('从编辑器同步图片，数量:', editorImages.length)
    
    // 更新content中的images数组，合并而不是替换图片
    setContent(prev => {
      // 获取当前content中已有的图片
      const existingImages = prev.images || []
      
      // 合并编辑器中的图片和已有图片，保持不重复
      // 首先将所有图片放入一个Set中去重
      const allImagesSet = new Set([...existingImages, ...editorImages])
      
      // 转回数组
      const mergedImages = Array.from(allImagesSet)
      
      console.log(`合并后图片总数: ${mergedImages.length} (编辑器: ${editorImages.length}, 已有: ${existingImages.length})`)
      
      return {
        ...prev,
        images: mergedImages
      }
    })
  }

  // 计算剩余可上传图片数量
  const remainingImagesCount = 10 - content.images.length // 假设最大允许10张图片

  // 处理图片上传
  const handleImageUpload = (imageDataUrl: string) => {
    // 检查是否已达到最大图片数量限制
    if (content.images.length >= 10) {
      setError('最多只能上传10张图片')
      return false
    }

    // 添加新图片到内容中
    setContent(prev => ({
      ...prev,
      images: [...prev.images, imageDataUrl]
    }))
    
    // 上传成功
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
        
        // 改进复制到剪贴板的方法
        try {
          // 使用现代API
          await navigator.clipboard.writeText(newAccessCode)
          setNotificationMessage('访问码已复制到剪贴板')
          console.log('复制成功(现代API):', newAccessCode)
        } catch (clipboardError) {
          console.warn('现代剪贴板API失败，尝试备用方法', clipboardError)
          
          // 显示复制的访问码给用户，以防剪贴板失败
          setNotificationMessage(`访问码: ${newAccessCode} (请手动复制)`)
          
          // 尝试备用方法 - 创建临时元素并选择它
          const tempInput = document.createElement('textarea')
          tempInput.value = newAccessCode
          document.body.appendChild(tempInput)
          tempInput.select()
          
          try {
            // 尝试使用document.execCommand('copy')
            const copySuccess = document.execCommand('copy')
            if (copySuccess) {
              console.log('复制成功(备用方法):', newAccessCode)
              setNotificationMessage('访问码已复制到剪贴板')
            } else {
              console.warn('备用剪贴板方法失败')
              setNotificationMessage(`访问码: ${newAccessCode} (请手动复制)`)
            }
          } catch (execError) {
            console.error('execCommand复制失败', execError)
            setNotificationMessage(`访问码: ${newAccessCode} (请手动复制)`)
          } finally {
            document.body.removeChild(tempInput)
          }
        }
        
        // 无论复制是否成功，都在UI中加粗显示访问码
        console.log('生成的访问码:', newAccessCode)
        
        // 增加通知的显示时间
        setTimeout(() => setNotificationMessage(''), 5000) // 5秒后清除提示
      } else {
        setError(response.error || '生成访问码失败')
      }
    } catch (error) {
      console.error('生成访问码错误:', error)
      setError('生成访问码失败')
    } finally {
      setIsLoading(false)
    }
  }

  const handleFetchContent = async () => {
    if (!inputAccessCode || inputAccessCode.length < 4) return
    
    setIsLoading(true)
    setError('')
    
    try {
      const response = await getContent(inputAccessCode)
      if (response.success && response.data) {
        // 确保内容数据格式正确
        const fetchedContent = {
          text: response.data.text || '',
          images: response.data.images || [],
          createdAt: response.data.createdAt || Date.now()
        };
        
        // 保存当前访问码
        const currentCode = inputAccessCode
        
        // 显示图片加载日志，确保从服务器获取的图片被正确处理
        console.log('从服务器获取的图片数量:', fetchedContent.images.length)
        if(fetchedContent.images.length > 0) {
          console.log('首张图片URL前100个字符:', fetchedContent.images[0].substring(0, 100))
        }
        
        // 存储内容并更新状态
        setContent(fetchedContent)
        setAccessCode(currentCode)
        setIsContentLoaded(true)
        
        // 成功加载内容后清空输入框中的访问码
        setInputAccessCode('')
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
    console.log('创建新内容，重置所有状态')
    
    // 完全清空编辑器内容
    const emptyContent = {
      text: '',
      images: [],
      createdAt: Date.now()
    };
    
    // 重置所有相关状态
    setContent(emptyContent)
    setAccessCode('')
    setInputAccessCode('')
    setIsContentLoaded(false)
    setRemainingHours(null)
    setError('') 
    setNotificationMessage('')
    
    // 强制刷新编辑器组件 - 通过修改key或其他方式
    // 这里通过先设为null，然后再设为默认值来强制编辑器重新渲染
    setTimeout(() => {
      const resetEditor = document.querySelector('.ProseMirror')
      if (resetEditor) {
        resetEditor.innerHTML = ''
      }
      
      console.log('编辑器内容和状态已重置')
    }, 50)
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
    
    // 已输入的框显示不同的边框
    if (position < inputAccessCode.length) {
      return baseClasses + "border-2 border-blue-500 bg-blue-50";
    }
    
    // 下一个输入位置的框高亮
    if (inputAccessCode.length === position && isCodeInputFocused) {
      return baseClasses + "border-2 border-blue-500 shadow-sm";
    }
    
    // 未输入的框保持默认样式
    return baseClasses + "border border-gray-300 hover:border-gray-400";
  }

  // 保存内容变化
  const handleContentChange = (html: string) => {
    setContent(prev => {
      const newContent = { ...prev, text: html }
      
      // 检查内容是否被修改（仅在已加载内容的情况下）
      if (isContentLoaded && accessCode) {
        setIsContentModified(true)
      }
      
      return newContent
    })
  }
  
  // 保存已修改的内容
  const handleSaveContent = async () => {
    if (!accessCode || !isContentModified) return
    
    setIsLoading(true)
    setError('')
    
    try {
      const response = await updateContent(content, accessCode)
      
      if (response.success) {
        // 不显示保存成功的提示
        setIsContentModified(false) // 重置修改状态
      } else {
        setError(response.error || '保存内容失败')
      }
    } catch (error) {
      console.error('保存内容时出错:', error)
      setError('保存内容失败')
    } finally {
      setIsLoading(false)
    }
  }

  // 获取编辑器引用
  const [editor, setEditor] = useState<any>(null)

  // 当内容加载时，显示图片数量，并确保所有图片正确加载
  useEffect(() => {
    if (isContentLoaded && content.images && content.images.length > 0) {
      console.log('内容已加载，包含图片数量:', content.images.length)
      
      // 验证图片加载情况
      content.images.forEach((imageUrl, index) => {
        // 创建一个图片元素来测试图片加载
        const img = new Image()
        img.onload = () => console.log(`图片 ${index+1} 加载成功 (${img.width}x${img.height})`)
        img.onerror = () => console.error(`图片 ${index+1} 加载失败`)
        img.src = imageUrl
      })
    }
  }, [isContentLoaded, content.images])

  // 从预览区域删除图片
  const handleDeleteImage = (indexToDelete: number) => {
    console.log('从预览区删除图片，索引:', indexToDelete)
    
    // 删除内容中的图片
    setContent(prev => {
      const updatedImages = prev.images.filter((_, index) => index !== indexToDelete)
      return {
        ...prev,
        images: updatedImages
      }
    })
    
    // 如果编辑器实例存在，也从编辑器中删除对应图片
    if (editor) {
      // 从编辑器的JSON结构中查找并删除对应图片
      const content = editor.getJSON()
      let imageIndex = 0
      let nodeToRemove = null
      let nodePos = -1
      
      // 递归查找要删除的图片节点
      const findImageToDelete = (node: any, pos = 0) => {
        if (node.type === 'image') {
          if (imageIndex === indexToDelete) {
            nodeToRemove = node
            nodePos = pos
            return true
          }
          imageIndex++
        }
        
        if (node.content) {
          for (let i = 0; i < node.content.length; i++) {
            const childPos = pos + 1 + (i > 0 ? editor.getJSON().content.slice(0, i).reduce((sum, n) => sum + nodeSize(n), 0) : 0)
            if (findImageToDelete(node.content[i], childPos)) return true
          }
        }
        return false
      }
      
      // 计算节点大小
      const nodeSize = (node: any): number => {
        if (!node.content) return 1
        return 1 + node.content.reduce((sum: number, n: any) => sum + nodeSize(n), 0)
      }
      
      // 从编辑器内容中删除图片
      // 注意：由于Tiptap的结构复杂，这里我们可能需要更简单的方法
      // 例如重新设置编辑器内容，但移除指定索引的图片
      try {
        // 尝试执行删除
        const currentHTML = editor.getHTML()
        const images = extractImagesFromHTML(currentHTML)
        
        if (images.length > indexToDelete) {
          const imgToRemove = images[indexToDelete]
          const newHTML = removeImageFromHTML(currentHTML, imgToRemove)
          editor.commands.setContent(newHTML)
        }
      } catch (error) {
        console.error('从编辑器删除图片失败:', error)
      }
    }
  }
  
  // 从HTML中提取所有图片URL
  const extractImagesFromHTML = (html: string): string[] => {
    const images: string[] = []
    const imgRegex = /<img[^>]+src="([^">]+)"/g
    let match
    
    while ((match = imgRegex.exec(html)) !== null) {
      images.push(match[1])
    }
    
    return images
  }
  
  // 从HTML中移除特定图片
  const removeImageFromHTML = (html: string, imageUrl: string): string => {
    // 转义特殊字符，以便在正则表达式中使用
    const escapedUrl = imageUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const imgRegex = new RegExp(`<img[^>]+src="${escapedUrl}"[^>]*>`, 'g')
    return html.replace(imgRegex, '')
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
                disabled={inputAccessCode.length !== 4 || isLoading}
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
                <p>正在编辑通过访问码 {accessCode} 获取的内容。该内容自动失效时间：{remainingHours}小时后</p>
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
              onChange={handleContentChange}
              onImageUpload={handleImageUpload}
              onImagesSync={syncImagesFromEditor}
              isReadOnly={false}
              onSave={handleSaveContent}
              showSaveButton={isContentLoaded}
              isModified={isContentModified}
              onEditorReady={setEditor}
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
                已上传 {content.images.length}/10 张图片，还可上传 {remainingImagesCount} 张
              </div>
            )}
          </div>

          {/* 图片预览区域 - 缩略图样式 */}
          {content.images.length > 0 && (
            <div className="mb-4">
              <h3 className="text-lg font-medium mb-2">已上传图片预览</h3>
              <div className="grid grid-cols-5 gap-4">
                {content.images.map((image, index) => (
                  <div 
                    key={index} 
                    className="thumbnail-container"
                  >
                    <img
                      src={image}
                      alt={`上传图片 ${index + 1}`}
                      className="thumbnail-image"
                    />
                    {/* 删除按钮 */}
                    <button
                      className="delete-button"
                      onClick={() => handleDeleteImage(index)}
                      title="删除图片"
                    >
                      ✕
                    </button>
                  </div>
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