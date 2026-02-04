/**
 * 统一的异步操作处理Hook
 * 消除所有重复的 try-catch + loading + progress 模式
 */

import { useState } from 'react'

export interface ProgressState {
  message: string
  step: string
}

export interface AsyncOperationState {
  isLoading: boolean
  progress: ProgressState
}

export function useAsyncOperation() {
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState<ProgressState>({ message: '', step: '' })

  const execute = async <T,>(
    operation: (updateProgress: (message: string, step: string) => void) => Promise<T>,
    options?: {
      onSuccess?: (result: T) => void
      onError?: (error: Error) => void
      successMessage?: string
      errorMessage?: string
    }
  ): Promise<T | null> => {
    try {
      setIsLoading(true)
      
      const updateProgress = (message: string, step: string) => {
        setProgress({ message, step })
      }

      const result = await operation(updateProgress)

      if (options?.successMessage) {
        setProgress({ message: options.successMessage, step: '' })
        setTimeout(() => {
          setProgress({ message: '', step: '' })
        }, 2000)
      } else {
        setProgress({ message: '', step: '' })
      }

      options?.onSuccess?.(result)
      return result
    } catch (error: any) {
      const errorMsg = options?.errorMessage 
        ? `${options.errorMessage}: ${error.message}`
        : error.message
      
      alert(errorMsg)
      options?.onError?.(error)
      setProgress({ message: '', step: '' })
      return null
    } finally {
      setIsLoading(false)
    }
  }

  const clearProgress = () => {
    setProgress({ message: '', step: '' })
  }

  return {
    isLoading,
    progress,
    execute,
    clearProgress,
    setProgress
  }
}

