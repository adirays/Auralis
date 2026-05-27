import React, { useState } from 'react'

export function ImageWithFallback(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [didError, setDidError] = useState(false)
  const { src, alt, style, className, ...rest } = props

  if (!src || didError) {
    return (
      <div
        className={`flex items-center justify-center bg-muted/20 border border-border ${className ?? ''}`}
        style={style}
      >
        <div className="flex flex-col items-center gap-1 opacity-30">
          <svg width="32" height="32" viewBox="0 0 88 88" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeLinejoin="round" fill="none" strokeWidth="3.7">
            <rect x="16" y="16" width="56" height="56" rx="6"/>
            <path d="m16 58 16-18 32 32"/>
            <circle cx="53" cy="35" r="7"/>
          </svg>
          <span className="font-mono text-[9px] uppercase tracking-wider">No image</span>
        </div>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      {...rest}
      onError={() => setDidError(true)}
    />
  )
}
