'use client'

import { useState } from 'react'

export function useConfirm() {
  const [pending, setPending] = useState<{ message: string; resolve: (value: boolean) => void } | null>(null)

  function confirm(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      setPending({ message, resolve })
    })
  }

  function handleConfirm() {
    pending?.resolve(true)
    setPending(null)
  }

  function handleCancel() {
    pending?.resolve(false)
    setPending(null)
  }

  const modal = pending ? (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={handleCancel}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-2">Confirmar</h3>
        <p className="text-sm text-gray-600 mb-4">{pending.message}</p>
        <div className="flex gap-2">
          <button onClick={handleCancel} className="flex-1 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
          <button onClick={handleConfirm} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Confirmar</button>
        </div>
      </div>
    </div>
  ) : null

  return { confirm, modal }
}
