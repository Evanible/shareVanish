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
  isReadOnly?: boolean
  onSave?: () => void
  showSaveButton?: boolean
  isModified?: boolean
}

const RichTextEditor = ({
  initialValue,
  onChange,
  onImageUpload,
  isReadOnly = false,
  onSave,
  showSaveButton = false,
  isModified = false
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
    }
  }, [editor, checkContentHeight])

  // 监听窗口大小变化时重新检查内容高度
  useEffect(() => {
    const handleResize = () => checkContentHeight()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [checkContentHeight])

  // 当initialValue变化时更新编辑器内容
  useEffect(() => {
    if (editor && initialValue !== editor.getHTML()) {
      console.log('编辑器内容更新:', initialValue ? '有内容' : '空内容')
      editor.commands.setContent(initialValue)
      
      // 内容变化时检查高度
      setTimeout(checkContentHeight, 50)
    }
  }, [initialValue, editor, checkContentHeight])

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
      
      const file = files[0]
      
      // 检查图片大小限制
      if (file.size > 3 * 1024 * 1024) {
        alert('图片大小不能超过3MB')
        return
      }
      
      try {
        // 读取文件为DataURL
        const reader = new FileReader()
        reader.onload = () => {
          const imageDataUrl = reader.result as string
          
          // 通过回调函数处理图片
          const success = onImageUpload(imageDataUrl)
          
          // 如果成功，插入图片到编辑器
          if (success && editor) {
            editor.chain().focus().setImage({ src: imageDataUrl }).run()
            // 图片加载后检查内容高度
            setTimeout(checkContentHeight, 100)
          }
        }
        reader.readAsDataURL(file)
      } catch (error) {
        console.error('图片上传失败', error)
      }
    },
    [editor, onImageUpload, isReadOnly, checkContentHeight]
  )

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

  if (!editor) {
    return null
  }

  return (
    <div className="rich-text-editor">
      {/* 工具栏 - 只在非只读模式下显示 */}
      {!isReadOnly && (
        <div className="editor-toolbar">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={editor.isActive('bold') ? 'is-active' : ''}
            title="粗体"
          >
            <strong>B</strong>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={editor.isActive('italic') ? 'is-active' : ''}
            title="斜体"
          >
            <em>I</em>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={editor.isActive('underline') ? 'is-active' : ''}
            title="下划线"
          >
            <u>U</u>
          </button>
          <button onClick={addLink} title="插入链接">
            🔗
          </button>
          <label className="image-button" title="插入图片">
            🖼️
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
          </label>
          <button
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={editor.isActive('code') ? 'is-active' : ''}
            title="行内代码"
          >
            `
          </button>
          <button
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={editor.isActive('codeBlock') ? 'is-active' : ''}
            title="代码块"
          >
            ```
          </button>
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={editor.isActive('bulletList') ? 'is-active' : ''}
            title="无序列表"
          >
            •
          </button>
          <button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={editor.isActive('orderedList') ? 'is-active' : ''}
            title="有序列表"
          >
            1.
          </button>
          
          {/* 保存按钮 - 更改样式使其与其他工具栏按钮一致 */}
          {showSaveButton && onSave && (
            <button 
              onClick={onSave}
              className={isModified ? 'is-active' : 'disabled'}
              title="保存更改"
              disabled={!isModified}
            >
              💾
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