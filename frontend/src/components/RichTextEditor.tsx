import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { useCallback, useEffect, useState, useRef } from 'react'
import './RichTextEditor.css' // 导入样式

interface RichTextEditorProps {
  initialValue: string
  onChange: (html: string) => void
  onImageUpload: (imageDataUrl: string) => boolean
  onImagesSync?: (images: string[]) => void  // 添加图片同步回调
  isReadOnly?: boolean
  onSave?: () => void
  showSaveButton?: boolean
  isModified?: boolean
  onEditorReady?: (editor: any) => void  // 添加编辑器实例回调
}

const RichTextEditor = ({
  initialValue,
  onChange,
  onImageUpload,
  onImagesSync,
  isReadOnly = false,
  onSave,
  showSaveButton = false,
  isModified = false,
  onEditorReady
}: RichTextEditorProps) => {
  // 用于跟踪内容是否超过容器高度
  const [shouldShowScroll, setShouldShowScroll] = useState(false)
  // 引用编辑器容器元素
  const editorContentRef = useRef<HTMLDivElement>(null)
  
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({
        openOnClick: false,
      }),
      Image.configure({
        allowBase64: true,
      }),
    ],
    content: initialValue,
    onUpdate: ({ editor }) => {
      if (!isReadOnly) {
        const html = editor.getHTML()
        onChange(html)
        
        // 内容变化时检查是否需要显示滚动条
        checkContentHeight()
      }
    },
    editable: !isReadOnly,
  })

  // 检查内容高度是否超过容器高度
  const checkContentHeight = useCallback(() => {
    if (editorContentRef.current) {
      // 获取ProseMirror编辑器内容元素
      const editorElement = editorContentRef.current.querySelector('.ProseMirror')
      if (editorElement) {
        // 比较内容高度与容器高度
        const contentHeight = editorElement.scrollHeight
        const containerHeight = editorContentRef.current.clientHeight
        
        // 只有当内容高度超过容器高度时才显示滚动条
        setShouldShowScroll(contentHeight > containerHeight)
      }
    }
  }, [])

  // 初始化时和editor变化时检查内容高度
  useEffect(() => {
    if (editor) {
      // 编辑器初始化后检查内容高度
      setTimeout(checkContentHeight, 50) // 短暂延迟确保DOM渲染完成
      
      // 提供编辑器实例给父组件
      if (onEditorReady) {
        onEditorReady(editor)
      }
    }
  }, [editor, checkContentHeight, onEditorReady])

  // 监听窗口大小变化时重新检查内容高度
  useEffect(() => {
    const handleResize = () => checkContentHeight()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [checkContentHeight])

  // 当initialValue变化时更新编辑器内容
  useEffect(() => {
    if (editor && initialValue !== editor.getHTML()) {
      // 严格条件：仅当编辑器为空或者未获得焦点且内容不同时才更新
      if (editor.isEmpty || (!editor.isFocused && editor.getHTML() !== initialValue)) {
        console.log('编辑器内容更新:', initialValue ? '有内容' : '空内容')
        editor.commands.setContent(initialValue)
        
        // 内容变化时检查高度
        setTimeout(checkContentHeight, 50)
      }
    }
  }, [initialValue, editor, checkContentHeight])

  // 初始化图片从content.images同步到编辑器
  useEffect(() => {
    // 仅在图片变化时同步到编辑器
    if (onImagesSync && editor) {
      console.log('图片同步调用，检查编辑器中的图片')
      // 因为这个useEffect是响应onImagesSync变化的
      // 图片的实际同步是在update事件中完成的
    }
  }, [editor, onImagesSync])

  // 当isReadOnly变化时更新编辑器状态
  useEffect(() => {
    if (editor) {
      editor.setEditable(!isReadOnly)
    }
  }, [editor, isReadOnly])

  // 图片上传处理
  const handleImageUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (isReadOnly) return // 只读模式不允许上传
      
      const files = event.target.files
      if (!files || !files.length) return
      
      // 支持多图上传
      const uploadedImages: string[] = []
      let successCount = 0
      
      // 创建处理单个图片的函数
      const processImage = async (file: File) => {
        // 检查图片大小限制
        if (file.size > 3 * 1024 * 1024) {
          alert(`图片 ${file.name} 大小超过3MB限制`)
          return false
        }
        
        try {
          // 读取文件为DataURL
          const imageDataUrl = await readFileAsDataURL(file)
          
          // 通过回调函数处理图片
          const success = onImageUpload(imageDataUrl)
          
          // 如果成功，插入图片到编辑器
          if (success && editor) {
            editor.chain().focus().setImage({ src: imageDataUrl }).run()
            uploadedImages.push(imageDataUrl)
            return true
          } else {
            console.log('图片上传被拒绝:', file.name)
            return false // 上传失败
          }
        } catch (error) {
          console.error('图片上传失败', error)
          return false
        }
      }
      
      // 逐个处理图片，而不是在循环中
      for (let i = 0; i < files.length; i++) {
        const result = await processImage(files[i])
        if (result) successCount++
        else if (successCount === 0) break // 如果第一张就失败，停止处理
      }
      
      // 图片加载后检查内容高度
      setTimeout(checkContentHeight, 100)
      
      // 如果有图片未能上传，给出提示
      if (successCount < files.length) {
        alert(`已达到最大图片数量限制，仅插入了 ${successCount} 张图片`)
      }
      
      // 清空input以允许重复选择相同文件
      event.target.value = ''
      
      // 同步所有图片到外部
      if (onImagesSync && uploadedImages.length > 0) {
        // 获取编辑器中所有图片
        const images = extractImagesFromEditor(editor)
        console.log('同步编辑器中的图片到外部，数量:', images.length)
        onImagesSync(images)
      }
    },
    [editor, onImageUpload, isReadOnly, checkContentHeight, onImagesSync]
  )
  
  // 从编辑器内容中提取所有图片
  const extractImagesFromEditor = useCallback((editor: any) => {
    if (!editor) return []
    
    const images: string[] = []
    const content = editor.getJSON()
    
    // 递归查找图片节点
    const findImages = (node: any) => {
      if (node.type === 'image' && node.attrs && node.attrs.src) {
        images.push(node.attrs.src)
      }
      
      if (node.content && Array.isArray(node.content)) {
        node.content.forEach(findImages)
      }
    }
    
    if (content && content.content) {
      content.content.forEach(findImages)
    }
    
    return images
  }, [])
  
  // 从File对象创建DataURL
  const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // 插入链接
  const addLink = useCallback(() => {
    if (!editor || isReadOnly) return
    
    const url = prompt('请输入链接地址:', 'https://')
    if (!url) return
    
    const text = prompt('请输入链接文本:', '链接文本')
    
    // 如果已选择文本,保留文本,只更新链接
    if (editor.view.state.selection.empty && text) {
      editor
        .chain()
        .focus()
        .insertContent(`<a href="${url}">${text}</a>`)
        .run()
    } else {
      editor.chain().focus().setLink({ href: url }).run()
    }
    
    // 插入链接后检查内容高度
    setTimeout(checkContentHeight, 50)
  }, [editor, isReadOnly, checkContentHeight])

  // 监听编辑器内容变化同步图片
  useEffect(() => {
    if (editor && onImagesSync && !isReadOnly) {
      const updateImagesList = () => {
        const images = extractImagesFromEditor(editor)
        console.log('编辑器内容变化，当前图片数量:', images.length)
        onImagesSync(images)
      }
      
      // 在编辑器内容变化或删除操作时更新图片列表
      editor.on('update', updateImagesList)
      
      // 在编辑器初始化时执行一次同步
      updateImagesList()
      
      return () => {
        editor.off('update', updateImagesList)
      }
    }
  }, [editor, onImagesSync, isReadOnly, extractImagesFromEditor])

  if (!editor) {
    return null
  }

  return (
    <div className="rich-text-editor">
      {/* 菜单栏 - 只在非只读模式显示 */}
      {editor && !isReadOnly && (
        <div className="menu-bar">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={editor.isActive('bold') ? 'is-active' : ''}
            title="粗体"
          >
            <span className="format-icon">B</span>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={editor.isActive('italic') ? 'is-active' : ''}
            title="斜体"
          >
            <span className="format-icon" style={{fontStyle: 'italic'}}>I</span>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={editor.isActive('underline') ? 'is-active' : ''}
            title="下划线"
          >
            <span className="format-icon" style={{textDecoration: 'underline'}}>U</span>
          </button>
          <button onClick={addLink} title="插入链接">
            <span className="format-icon">🔗</span>
          </button>
          <label className="file-input-container" title="插入图片" style={{width: '28px', height: '28px'}}>
            <button>
              <span className="format-icon">📷</span>
            </button>
            <input
              type="file"
              accept="image/*"
              multiple  // 支持多图选择
              onChange={handleImageUpload}
              className="file-input"
            />
          </label>
          <button
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={editor.isActive('code') ? 'is-active' : ''}
            title="行内代码"
          >
            <span className="format-icon">`</span>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={editor.isActive('codeBlock') ? 'is-active' : ''}
            title="代码块"
          >
            <span className="format-icon">```</span>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={editor.isActive('bulletList') ? 'is-active' : ''}
            title="无序列表"
          >
            <span className="format-icon">•</span>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={editor.isActive('orderedList') ? 'is-active' : ''}
            title="有序列表"
          >
            <span className="format-icon">1.</span>
          </button>
          
          {/* 保存按钮 - 更改样式使其与其他工具栏按钮一致 */}
          {showSaveButton && onSave && (
            <button 
              onClick={onSave}
              className={`save-button ${isModified ? 'is-modified' : ''}`}
              title="保存更改"
              disabled={!isModified}
            >
              保存
            </button>
          )}
        </div>
      )}

      {/* 编辑器内容区 - 根据内容高度动态决定是否显示滚动条 */}
      <EditorContent 
        editor={editor} 
        className={`editor-content ${isReadOnly ? 'read-only' : ''}`} 
        style={{ 
          overflow: shouldShowScroll ? 'auto' : 'hidden',
        }}
        ref={editorContentRef}
      />

      {/* 气泡菜单 - 选中文本时显示，在只读模式下不显示 */}
      {editor && !isReadOnly && (
        <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }}
        shouldShow={() => false}>
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={editor.isActive('bold') ? 'is-active' : ''}
          >
            粗体
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={editor.isActive('italic') ? 'is-active' : ''}
          >
            斜体
          </button>
          <button
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={editor.isActive('underline') ? 'is-active' : ''}
          >
            下划线
          </button>
          <button onClick={addLink}>链接</button>
        </BubbleMenu>
      )}
    </div>
  )
}

export default RichTextEditor