'use client'

import { useEffect, useState } from 'react'
import { MediaImage, type MediaImageProps } from './MediaImage'

type MediaImageWithLoadingProps = MediaImageProps & {
  containerClassName?: string
  skeletonClassName?: string
  keepSkeletonOnError?: boolean
  showLoadingIndicator?: boolean
  loadingIndicatorClassName?: string
}

function mergeClassNames(...classNames: Array<string | undefined | false>): string {
  return classNames.filter(Boolean).join(' ')
}

export function MediaImageWithLoading({
  src,
  alt,
  className,
  containerClassName,
  skeletonClassName,
  keepSkeletonOnError = false,
  showLoadingIndicator = true,
  loadingIndicatorClassName,
  onLoad,
  onError,
  ...restProps
}: MediaImageWithLoadingProps) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    setIsLoaded(false)
    setIsError(false)
  }, [src])

  if (!src) return null

  const shouldShowSkeleton = !isLoaded && (!isError || keepSkeletonOnError)

  const imageClassName = mergeClassNames(
    className,
    'transition-opacity duration-200',
    shouldShowSkeleton ? 'opacity-0' : 'opacity-100',
  )

  const handleLoad: NonNullable<MediaImageProps['onLoad']> = (event) => {
    setIsLoaded(true)
    onLoad?.(event)
  }

  const handleError: NonNullable<MediaImageProps['onError']> = (event) => {
    setIsError(true)
    setIsLoaded(true)
    onError?.(event)
  }

  return (
    <div className={mergeClassNames('relative overflow-hidden bg-muted', containerClassName)}>
      {shouldShowSkeleton && (
        <div
          className={mergeClassNames(
            'pointer-events-none absolute inset-0 z-0 animate-pulse bg-muted',
            skeletonClassName,
          )}
        />
      )}
      {shouldShowSkeleton && showLoadingIndicator && (
        <div
          className={mergeClassNames(
            'pointer-events-none absolute inset-0 z-[1] flex items-center justify-center',
            loadingIndicatorClassName,
          )}
        >
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-[#1d4ed8]" />
          <span className="sr-only">Loading</span>
        </div>
      )}
      <MediaImage
        src={src}
        alt={alt}
        className={imageClassName}
        onLoad={handleLoad}
        onError={handleError}
        {...restProps}
      />
    </div>
  )
}
