import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { useCallback, useEffect, useState, useRef } from 'react'
import './RichTextEditor.css' // 导入样式

interface RichTextEditorProps {
  initialValue: string
  onChange: (html: string, images: string[]) => void
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
  // 用于防止重复更新
  const lastHTMLRef = useRef<string>('')
  
  // 从编辑器内容中提取所有图片
  const extractImagesFromEditor = (editor: any) => {
    if (!editor) {
      console.log('提取图片失败: 编辑器实例不存在')
      return []
    }
    
    console.log('开始从编辑器内容中提取图片')
    
    try {
      const images: string[] = []
      const content = editor.getJSON()
      
      // 打印编辑器内容结构
      console.log('编辑器内容结构:', JSON.stringify(content, null, 2).substring(0, 200) + '...')
      
      // 递归查找图片节点
      const findImages = (node: any) => {
        if (node.type === 'image' && node.attrs && node.attrs.src) {
          images.push(node.attrs.src)
          console.log(`找到图片节点: ${node.attrs.src.substring(0, 30)}...`)
        }
        
        if (node.content && Array.isArray(node.content)) {
          node.content.forEach(findImages)
        }
      }
      
      if (content && content.content) {
        console.log(`遍历编辑器内容，顶层节点数量: ${content.content.length}`)
        content.content.forEach(findImages)
      } else {
        console.log('编辑器内容为空或格式不正确')
      }
      
      console.log(`提取到编辑器中的图片总数: ${images.length}`)
      return images
    } catch (error) {
      console.error('提取图片时出错:', error)
      return []
    }
  }
  
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
        console.log('编辑器内容更新，HTML长度:', html.length)
        console.log('编辑器isFocused状态:', editor.isFocused)
        
        // 检查内容是否真的发生变化
        if (html !== lastHTMLRef.current) {
          console.log('内容确实变化，触发onChange')
          lastHTMLRef.current = html
          const images = extractImagesFromEditor(editor)
          onChange(html, images)
        } else {
          console.log('内容无变化，忽略onChange调用')
        }
        
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
      // 严格条件：只有当编辑器为空时才自动更新内容
      if (editor.isEmpty) {
        console.log('编辑器内容更新:', initialValue ? '有内容' : '空内容');
        
        // 确保更新不会触发太多次onChange
        lastHTMLRef.current = initialValue;
        editor.commands.setContent(initialValue);
        
        // 内容变化时检查高度
        setTimeout(checkContentHeight, 50);
      }
    }
  }, [initialValue, editor, checkContentHeight]);

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

  // 新增：使用不同的方法插入多张图片
  const insertMultipleImages = useCallback((imageUrls: string[]) => {
    if (!editor || imageUrls.length === 0) {
      console.log('无法插入图片：编辑器不可用或图片URL列表为空')
      return
    }
    
    console.log(`尝试插入 ${imageUrls.length} 张图片，在光标位置`)
    
    try {
      // 确保编辑器是聚焦的
      editor.commands.focus();
      
      // 保存当前选区位置的引用
      const { from } = editor.state.selection;
      
      // 构建所有图片的HTML
      let imagesHtml = '';
      imageUrls.forEach((url, index) => {
        imagesHtml += `<img src="${url}" alt="上传图片${index+1}" />`;
        console.log(`添加图片 ${index+1} 到HTML: ${url.substring(0, 30)}...`);
      });
      
      // 一次性插入所有图片
      console.log(`在位置 ${from} 插入 ${imageUrls.length} 张图片的HTML`);
      editor.chain().focus().insertContentAt(from, imagesHtml).run();
      
      // 验证插入后的内容
      setTimeout(() => {
        const images = extractImagesFromEditor(editor);
        console.log(`验证：编辑器中的图片数量: ${images.length}，期望数量: ${imageUrls.length}`);
        
        // 如果图片数量不匹配，尝试逐个插入
        if (images.length < imageUrls.length) {
          console.log('检测到图片数量不匹配，尝试备用方法');
          retryInsertImages(imageUrls);
        }
      }, 300);
    } catch (error) {
      console.error('插入多张图片过程中发生错误:', error);
      retryInsertImages(imageUrls);
    }
  }, [editor, extractImagesFromEditor]);
  
  // 添加备用的图片插入方法
  const retryInsertImages = useCallback((imageUrls: string[]) => {
    if (!editor || imageUrls.length === 0) return;
    
    console.log('使用备用方法逐个插入图片');
    
    try {
      // 逐个插入图片
      imageUrls.forEach((url, index) => {
        console.log(`备用方法：插入第 ${index+1}/${imageUrls.length} 张图片`);
        editor.commands.focus();
        editor.commands.insertContent(`<img src="${url}" alt="上传图片${index+1}" />`);
      });
      
      // 再次验证
      setTimeout(() => {
        const finalImages = extractImagesFromEditor(editor);
        console.log(`备用方法后最终图片数量: ${finalImages.length}`);
      }, 300);
    } catch (fallbackError) {
      console.error('备用插入方法也失败:', fallbackError);
    }
  }, [editor, extractImagesFromEditor]);
  
  // 图片上传处理
  const handleImageUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (isReadOnly) return // 只读模式不允许上传
      
      const files = event.target.files
      if (!files || !files.length) return
      
      // 调试日志: 显示选择的文件数量
      console.log(`=== 图片上传开始: 选择了 ${files.length} 个文件 ===`)
      
      // 支持多图上传，记录所有成功的上传
      const uploadedImages: string[] = []
      let successCount = 0
      
      // 创建处理单个图片的函数
      const processImage = async (file: File) => {
        // 调试日志: 处理单个图片
        console.log(`处理图片: ${file.name}, 大小: ${(file.size / 1024 / 1024).toFixed(2)}MB`)
        
        // 检查图片大小限制，但不弹出alert，只记录日志
        if (file.size > 3 * 1024 * 1024) {
          console.warn(`图片 ${file.name} 大小超过3MB限制，但仍将尝试上传`)
          // 不再中断上传流程
        }
        
        try {
          // 读取文件为DataURL
          const imageDataUrl = await readFileAsDataURL(file)
          console.log(`图片 ${file.name} 已读取为DataURL`)
          
          // 通过回调函数处理图片
          const success = onImageUpload(imageDataUrl)
          console.log(`图片 ${file.name} 上传结果: ${success ? '成功' : '失败'}`)
          
          // 如果成功，将图片添加到待插入列表
          if (success) {
            uploadedImages.push(imageDataUrl)
            console.log(`图片 ${file.name} 已添加至上传列表，当前列表长度: ${uploadedImages.length}`)
            return true
          } else {
            console.log(`图片 ${file.name} 被拒绝上传，但不显示错误消息`)
            return false // 上传失败
          }
        } catch (error) {
          console.error(`图片 ${file.name} 上传失败`, error)
          return false
        }
      }
      
      // 逐个处理图片
      for (let i = 0; i < files.length; i++) {
        console.log(`开始处理第 ${i+1}/${files.length} 张图片`)
        const result = await processImage(files[i])
        if (result) successCount++
      }
      
      console.log(`图片处理完成: ${successCount}/${files.length} 张成功，准备插入编辑器`)
      console.log(`待插入图片列表长度: ${uploadedImages.length}`)
      
      // 每次上传后立即插入图片
      if (uploadedImages.length > 0 && editor) {
        console.log(`准备将 ${uploadedImages.length} 张图片插入编辑器`);
        
        // 无论单张还是多张图片，都使用insertMultipleImages函数处理
        insertMultipleImages(uploadedImages);
      } else {
        console.log('没有图片需要插入或编辑器不可用');
      }
      
      // 图片加载后检查内容高度
      setTimeout(() => {
        checkContentHeight();
        console.log('已检查内容高度');
        
        // 额外验证已插入的图片
        if (editor) {
          const finalImages = extractImagesFromEditor(editor);
          console.log(`编辑器中最终图片数量: ${finalImages.length}`);
          
          // 确保图片同步到外部
          if (onImagesSync && finalImages.length > 0) {
            console.log('最终图片同步到外部');
            onImagesSync(finalImages);
          }
        }
      }, 500);
      
      // 清空input以允许重复选择相同文件
      event.target.value = '';
      console.log('已清空input值，允许重新选择相同文件');
      
      console.log('=== 图片上传处理完成 ===');
    },
    [editor, onImageUpload, isReadOnly, checkContentHeight, onImagesSync, insertMultipleImages, extractImagesFromEditor]
  )
  
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
      // 保存最后一次同步的图片列表
      let lastSyncedImages: string[] = [];
      
      const updateImagesList = () => {
        const images = extractImagesFromEditor(editor);
        console.log('编辑器内容变化，当前图片数量:', images.length);
        
        // 检查是否与上次同步的图片列表相同
        const isSameImages = images.length === lastSyncedImages.length && 
          images.every((img, idx) => lastSyncedImages[idx] === img);
        
        if (!isSameImages) {
          console.log('检测到图片列表变化，执行同步');
          lastSyncedImages = [...images];
          onImagesSync(images);
        } else {
          console.log('图片列表未变化，跳过同步');
        }
      };
      
      // 对update事件添加防抖处理
      let debounceTimer: number | null = null;
      
      const debouncedUpdateImages = () => {
        if (debounceTimer !== null) {
          window.clearTimeout(debounceTimer);
        }
        
        debounceTimer = window.setTimeout(() => {
          updateImagesList();
          debounceTimer = null;
        }, 300);
      };
      
      // 在编辑器内容变化或删除操作时更新图片列表
      editor.on('update', debouncedUpdateImages);
      
      // 在编辑器初始化时执行一次同步
      setTimeout(updateImagesList, 200);
      
      return () => {
        editor.off('update', debouncedUpdateImages);
        if (debounceTimer !== null) {
          window.clearTimeout(debounceTimer);
        }
      };
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
