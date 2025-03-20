import { useState, useEffect, useCallback, useRef } from 'react'
import { createContent, getContent, type Content, updateContent, type ApiResponse } from './api'
import './App.css'
import RichTextEditor from './components/RichTextEditor'
// 更新标记：强制浏览器加载新版本 - v1.0.1
import './test.css'

// 定义常量
const MAX_IMAGES = 10; // 最大图片数量
const MAX_IMAGE_SIZE_MB = 3; // 单张图片最大大小限制（MB）

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
  // 添加编辑器key状态，用于强制重新渲染编辑器
  const [editorKey, setEditorKey] = useState(`editor-${Date.now()}`)
  // 添加4个独立的输入框状态
  const [codeInputs, setCodeInputs] = useState(['', '', '', ''])
  // 添加弹窗状态
  const [showPopup, setShowPopup] = useState(false)
  // 添加弹窗错误状态
  const [popupError, setPopupError] = useState('')
  // 添加通知消息状态
  const [notificationMessage, setNotificationMessage] = useState('')
  // 添加图片提示信息状态
  const [imageMessage, setImageMessage] = useState('')
  // 弹窗引用，用于检测外部点击
  const popupRef = useRef<HTMLDivElement>(null)

  // 添加全局键盘事件以支持Enter键快速提取
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      console.log(`键盘事件触发: ${e.key}, 按键代码: ${e.code}`);
      console.log(`焦点元素: ${document.activeElement?.tagName}, 类名: ${document.activeElement?.className}`);
      
      // 按ESC键关闭弹窗
      if (e.key === 'Escape' && showPopup) {
        console.log('ESC键按下，关闭弹窗');
        setShowPopup(false);
        setPopupError('');
        setCodeInputs(['', '', '', '']);
      }
      
      // 保留原有的Enter键功能，但仅在访问码输入框有焦点时触发
      if (e.key === 'Enter' && inputAccessCode.length === 4 && !isLoading && isCodeInputFocused) {
        // 防止事件冒泡导致编辑器中回车问题
        console.log('访问码输入框中按下回车，执行提取内容');
        e.preventDefault();
        handleFetchContent();
      }
      
      // 完全阻止编辑器外的回车键触发保存按钮状态变化
      if (e.key === 'Enter') {
        // 检查焦点是否在编辑器内
        const activeElement = document.activeElement;
        const isEditorFocused = activeElement?.closest('.ProseMirror') !== null;
        
        console.log(`回车键处理: 编辑器焦点=${isEditorFocused}, 访问码输入焦点=${isCodeInputFocused}`);
        
        // 如果焦点不在编辑器内或访问码输入框内，阻止默认行为
        if (!isEditorFocused && !isCodeInputFocused) {
          console.log('阻止回车键默认行为');
          e.preventDefault();
        } else {
          console.log('允许回车键默认行为');
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
        
        // 确保createdAt是有效的数字
        let createdAtTime = content.createdAt
        if (typeof createdAtTime === 'string') {
          createdAtTime = new Date(createdAtTime).getTime()
        }
        
        // 验证createdAt是否为有效数字
        if (isNaN(createdAtTime)) {
          console.error('无效的createdAt时间戳，使用当前时间:', content.createdAt)
          createdAtTime = Date.now() // 如果无效，使用当前时间
          
          // 更新content以修复无效时间戳
          setContent(prev => ({
            ...prev,
            createdAt: createdAtTime
          }))
        }
        
        const expiryTime = createdAtTime + (24 * 60 * 60 * 1000) // 24小时后过期
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
        // 确保createdAt是有效的时间戳
        let createdAt = response.data.createdAt || Date.now();
        
        // 验证并修复时间戳
        if (isNaN(createdAt)) {
          console.error('从API收到无效的createdAt，使用当前时间代替');
          createdAt = Date.now();
        }
        
        const contentData = {
          ...response.data,
          createdAt: createdAt
        };
        
        console.log('获取内容成功，createdAt:', new Date(createdAt).toLocaleString());
        
        setContent(contentData)
        setAccessCode(inputAccessCode)
        setIsContentLoaded(true)
        setIsContentModified(false)
        
        // 计算剩余时间
        const hoursRemaining = calculateRemainingHours(contentData.createdAt);
        setRemainingHours(hoursRemaining);
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
        // 成功获取内容，确保createdAt是有效的时间戳
        let createdAt = response.data.createdAt || Date.now();
        
        // 验证并修复时间戳
        if (isNaN(createdAt)) {
          console.error('从API收到无效的createdAt，使用当前时间代替');
          createdAt = Date.now();
        }
        
        const contentData = {
          ...response.data,
          createdAt: createdAt
        };
        
        console.log('获取内容成功，createdAt:', new Date(createdAt).toLocaleString());
        
        // 更新编辑器key，强制重新渲染编辑器
        setEditorKey(`editor-fetch-${inputAccessCode}-${Date.now()}`);
        
        // 重置编辑器内容为空，然后设置新内容，确保完全刷新
        setContent({
      text: '',
      images: [],
      createdAt: Date.now()
        });
        
        // 短暂延迟后再设置新内容，确保编辑器已重置
        setTimeout(() => {
          // 设置内容
          setContent(contentData);
          setAccessCode(inputAccessCode);
          setIsContentLoaded(true);
          setIsContentModified(false);
          
          // 计算剩余时间
          const hoursRemaining = calculateRemainingHours(contentData.createdAt);
          setRemainingHours(hoursRemaining);
          
          // 关闭弹窗
          setShowPopup(false);
        }, 50);
        
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
    // 如果有未保存的内容，先提示用户
    if (isContentLoaded && isContentModified) {
      const confirmResult = window.confirm("您有未保存的内容，继续操作可能导致内容丢失。是否继续？");
      if (!confirmResult) {
        return; // 用户取消操作
      }
      
      // 更新编辑器key，强制重新渲染编辑器
      setEditorKey(`editor-popup-${Date.now()}`);
      
      // 用户确认，先重置内容确保不会看到旧内容
      setContent({
        text: '',
        images: [],
        createdAt: Date.now()
      });
    }
    
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

  // 处理文本内容变化
  const handleTextChange = (html: string) => {
    console.log('handleTextChange被调用,HTML长度:', html.length);
    
    // 使用本地变量保存比较结果，提高性能
    const contentChanged = html !== content.text;
    console.log('内容是否变化:', contentChanged);

    if (contentChanged) {
      // 内容确实变化，更新状态
      setContent(prev => {
        return { ...prev, text: html };
      });
      
      // 如果当前未标记为已修改，则设置修改标志
      if (!isContentModified) {
        console.log('设置isContentModified为true');
        setIsContentModified(true);
      }
    } else {
      console.log('忽略相同内容的更新');
    }
  }

  // 解决全局回车键导致的问题
  useEffect(() => {
    // 添加防抖功能，避免多次触发
    let debounceTimer: number | null = null;
    
    // 创建一个特定的回车键处理函数，避免重复触发文本更新
    const handleEnterKeyPress = (e: KeyboardEvent) => {
      // 如果不是回车键，直接返回
      if (e.key !== 'Enter') return;
      
      // 检查焦点是否在编辑器内
      const activeElement = document.activeElement;
      const isEditorFocused = activeElement?.closest('.ProseMirror') !== null;
      
      console.log('回车键事件:', {isEditorFocused, target: e.target});
      
      // 如果焦点在编辑器内，避免重复触发文本更新
      if (isEditorFocused) {
        // 阻止事件冒泡，防止触发保存功能或其他全局处理
        e.stopPropagation();
        
        // 使用防抖处理，避免快速连续的回车键导致多次状态更新
        if (debounceTimer) {
          window.clearTimeout(debounceTimer);
        }
        
        debounceTimer = window.setTimeout(() => {
          console.log('回车键防抖处理完成');
          debounceTimer = null;
        }, 100);
      }
    };
    
    // 添加按键监听，捕获阶段处理
    document.addEventListener('keydown', handleEnterKeyPress, true);
    
    return () => {
      document.removeEventListener('keydown', handleEnterKeyPress, true);
      if (debounceTimer) {
        window.clearTimeout(debounceTimer);
      }
    };
  }, []);

  // 处理图片上传
  const handleImageUpload = (dataUrl: string) => {
    // 日志显示当前图片数量
    console.log(`当前图片数量: ${content.images.length}/${MAX_IMAGES}`);
    
    // 防止重复添加相同的图片
    if (content.images.includes(dataUrl)) {
      console.log('图片已存在，忽略');
      return false;
    }
    
    // 检查图片数量限制，但不显示错误消息，只返回false
    if (content.images.length >= MAX_IMAGES) {
      console.log(`图片数量已达上限 (${MAX_IMAGES})，但允许临时上传`);
      // 即使超过限制也返回true，允许图片上传到编辑器
      // 最终保存时再处理超过限制的部分
    }
    
    // 检查图片大小但不阻止上传
    const base64Length = dataUrl.substring(dataUrl.indexOf(',') + 1).length;
    const sizeInMB = (base64Length * 0.75) / (1024 * 1024);
    if (sizeInMB > MAX_IMAGE_SIZE_MB) {
      console.log(`图片大小超过限制: ${sizeInMB.toFixed(2)}MB > ${MAX_IMAGE_SIZE_MB}MB，但允许临时上传`);
      // 不阻止上传，最终保存时再处理
    }
    
    console.log(`添加新图片，新总数: ${content.images.length + 1}`);
    setContent(prev => ({
      ...prev,
      images: [...prev.images, dataUrl]
    }));
    setIsContentModified(true);
    return true;
  }

  // 处理图片删除
  const handleImageDelete = (index: number) => {
    // 清除任何图片相关的提示消息
    if (imageMessage) {
      setImageMessage('');
    }
    
    setContent(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }))
    setIsContentModified(true)
    
    // 发送图片删除事件到编辑器
    if (content.images[index]) {
      const event = new CustomEvent('removeImage', {
        detail: { src: content.images[index] }
      });
      document.dispatchEvent(event);
    }
  }

  // 处理图片同步
  const handleImagesSync = useCallback((images: string[]) => {
    console.log(`图片同步回调: 编辑器中图片数量 ${images.length}, 内容中图片数量 ${content.images.length}`);
    
    // 图片数量异常检查 - 如果编辑器图片数量为0但content中有图片，可能是同步太早，跳过本次同步
    if (images.length === 0 && content.images.length > 0) {
      console.warn('编辑器中图片数量为0，但content中有图片，跳过本次同步以防丢失图片');
      return;
    }
    
    // 使用Set进行高效比较
    const currentImageSet = new Set(content.images);
    const newImageSet = new Set(images);
    
    // 检查是否有变化
    let hasChanges = false;
    
    // 检查图片数量是否超过限制
    if (images.length > MAX_IMAGES) {
      console.warn(`编辑器图片数量(${images.length})超过限制(${MAX_IMAGES})，但不立即提示`);
      // 记录日志但不立即提示用户
      hasChanges = true;
    } else if (images.length !== content.images.length) {
      console.log(`图片数量变化: ${content.images.length} -> ${images.length}`);
      hasChanges = true;
    } else {
      // 检查内容是否变化
      for (const img of images) {
        if (!currentImageSet.has(img)) {
          console.log(`发现新图片: ${img.substring(0, 30)}...`);
          hasChanges = true;
          break;
        }
      }
      
      if (!hasChanges) {
        for (const img of content.images) {
          if (!newImageSet.has(img)) {
            console.log(`图片被移除: ${img.substring(0, 30)}...`);
            hasChanges = true;
            break;
          }
        }
      }
    }
    
    // 如果有变化，更新content
    if (hasChanges) {
      console.log(`更新内容中的图片，新数量: ${images.length}`);
      
      // 防止图片丢失：合并当前图片和新图片
      const mergedImages = [...images];
      
      // 设置状态时确保content.images是新的引用
      setContent(prev => ({
        ...prev,
        images: mergedImages
      }));
      
      setIsContentModified(true);
    }
  }, [content.images]);

  // 处理清除内容
  const handleClear = () => {
    // 如果有未保存的内容，先提示用户
    if (isContentModified) {
      const confirmResult = window.confirm("您有未保存的内容，继续操作可能导致内容丢失。是否继续？");
      if (!confirmResult) {
        return; // 用户取消操作
      }
    }
    
    // 更新编辑器key，强制重新渲染编辑器
    setEditorKey(`editor-new-${Date.now()}`);
    
    // 先清空内容，确保编辑器完全重置
    setContent({
      text: '',
      images: [],
      createdAt: Date.now()
    });
    
    // 用定时器确保状态更新，编辑器彻底清空
    setTimeout(() => {
      setAccessCode('');
      setInputAccessCode('');
      setCodeInputs(['', '', '', '']);
      setIsContentLoaded(false);
      setRemainingHours(null);
      setIsContentModified(false);
    }, 50);
  }

  // 处理内容更新
  const handleUpdateContent = async () => {
    console.log('=== 保存按钮被点击 ===');
    
    if (!accessCode || isLoading) return
    
    // 保存前检查图片数量和大小
    const oversizedImages = validateImages(content.images);
    if (content.images.length > MAX_IMAGES || oversizedImages.length > 0) {
      let message = "";
      if (content.images.length > MAX_IMAGES) {
        message += `图片数量(${content.images.length})超过限制(${MAX_IMAGES})，仅保存前${MAX_IMAGES}张。`;
      }
      if (oversizedImages.length > 0) {
        message += `${oversizedImages.length}张图片超过${MAX_IMAGE_SIZE_MB}MB大小限制，可能影响保存。`;
      }
      setImageMessage(message);
      
      // 修改content，仅保留限制内的图片
      if (content.images.length > MAX_IMAGES) {
        setContent(prev => ({
          ...prev,
          images: prev.images.slice(0, MAX_IMAGES)
        }));
      }
    } else {
      // 清除图片提示
      setImageMessage('');
    }
    
    setIsLoading(true)
    console.log('设置isLoading为true');
    setError('')
    
    try {
      console.log('开始调用API保存内容...');
      const response = await updateContent(content, accessCode)
      console.log('API返回结果:', response);
      
      if (response.success && response.data) {
        console.log('保存成功，将使用新的createdAt');
        
        // 明确设置新的createdAt时间戳，解决NaN问题
        const newTimestamp = Date.now();
        console.log('新的时间戳:', newTimestamp);
        
        // 更新编辑器key，确保编辑器重新渲染使用最新状态
        setEditorKey(`editor-saved-${accessCode}-${newTimestamp}`);
        
        setContent(prev => ({
          ...prev,
          createdAt: newTimestamp // 使用当前时间作为新的createdAt
        }))
        
        // 更新修改状态
        setIsContentModified(false);
        
        // 设置成功消息
        setNotificationMessage('内容已成功保存')
        setTimeout(() => setNotificationMessage(''), 3000)
      } else {
        setError(response.error || '保存内容失败')
        console.error('保存失败:', response.error);
      }
    } catch (err) {
      setError('保存内容时发生错误')
      console.error('保存出错:', err)
    } finally {
      setIsLoading(false)
      console.log('设置isLoading为false');
    }
  }

  // 验证图片大小和数量
  const validateImages = (images: string[]): string[] => {
    // 查找超过大小限制的图片
    const oversizedImages: string[] = [];
    
    for (const img of images) {
      // Base64图片大小估算 (去掉头部后的字符串长度 * 0.75 / 1024 / 1024)
      const base64Length = img.substring(img.indexOf(',') + 1).length;
      const sizeInMB = (base64Length * 0.75) / (1024 * 1024);
      
      if (sizeInMB > MAX_IMAGE_SIZE_MB) {
        console.log(`发现超大图片: ~${sizeInMB.toFixed(2)}MB`);
        oversizedImages.push(img);
      }
    }
    
    return oversizedImages;
  }

  // 处理内容创建
  const handleCreateContent = async () => {
    if (isLoading) return
    
    // 创建前检查图片数量和大小
    const oversizedImages = validateImages(content.images);
    if (content.images.length > MAX_IMAGES || oversizedImages.length > 0) {
      let message = "";
      if (content.images.length > MAX_IMAGES) {
        message += `图片数量(${content.images.length})超过限制(${MAX_IMAGES})，仅创建前${MAX_IMAGES}张。`;
      }
      if (oversizedImages.length > 0) {
        message += `${oversizedImages.length}张图片超过${MAX_IMAGE_SIZE_MB}MB大小限制，可能影响创建。`;
      }
      setImageMessage(message);
      
      // 修改content，仅保留限制内的图片
      if (content.images.length > MAX_IMAGES) {
        setContent(prev => ({
          ...prev,
          images: prev.images.slice(0, MAX_IMAGES)
        }));
      }
    } else {
      // 清除图片提示
      setImageMessage('');
    }
    
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
        
        // 清除图片提示
        setImageMessage('');
        
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
                  onClick={(e) => {
                    // 阻止事件冒泡，确保不被其他事件处理干扰
                    e.preventDefault();
                    e.stopPropagation();
                    handleUpdateContent();
                  }} 
                  disabled={isLoading} // 只在加载时禁用，移除isInitialState判断
                  className="action-button" // 移除save-button类名
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
              key={editorKey}
              initialValue={content.text}
              onChange={handleTextChange}
              onImageUpload={handleImageUpload}
              onImagesSync={handleImagesSync}
              isReadOnly={false}
              showSaveButton={false}
              onSave={handleUpdateContent}
              isModified={isContentModified}
            />
        </section>

        {/* 图片提示信息 - 位于编辑区和图片上传区之间 */}
        {imageMessage && (
          <div className="image-message">
            {imageMessage}
          </div>
        )}

        {/* 移除图片拖拽区 */}
        {/* 图片预览区 - 只在有图片时显示 */}
        {content.images.length > 0 && (
          <div className="preview-section">
            <h3 className="preview-stats">
              已上传 {content.images.length}/{MAX_IMAGES} 张图片
            </h3>
            <div className="preview-images">
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
          </div>
        )}
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