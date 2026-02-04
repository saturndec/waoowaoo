'use client'

interface ProgressToastProps {
  show: boolean
  message: string
  step?: string
}

export default function ProgressToast({ show, message, step }: ProgressToastProps) {
  if (!show) return null

  return (
    <div className="fixed bottom-8 right-8 z-50 animate-slide-up">
      <div className="bg-white rounded-lg shadow-2xl border border-gray-200 p-4 min-w-[320px]">
        <div className="flex items-start space-x-3">
          {/* Loading Spinner */}
          <div className="flex-shrink-0 mt-0.5">
            <svg 
              className="animate-spin h-5 w-5 text-blue-600" 
              xmlns="http://www.w3.org/2000/svg" 
              fill="none" 
              viewBox="0 0 24 24"
            >
              <circle 
                className="opacity-25" 
                cx="12" 
                cy="12" 
                r="10" 
                stroke="currentColor" 
                strokeWidth="4"
              />
              <path 
                className="opacity-75" 
                fill="currentColor" 
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
          
          {/* Content */}
          <div className="flex-1">
            <div className="font-semibold text-gray-900 mb-1">
              {message}
            </div>
            {step && (
              <div className="text-sm text-gray-600">
                {step}
              </div>
            )}
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="mt-3 w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
          <div className="bg-blue-600 h-1.5 rounded-full animate-progress" />
        </div>
      </div>
    </div>
  )
}

