import { Outlet } from 'react-router-dom'

export function AuthLayout() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex w-12 h-12 bg-brand rounded-xl items-center justify-center mb-3">
            <span className="text-white font-bold text-lg">T</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">TenPOS</h1>
          <p className="text-sm text-gray-400 mt-0.5">Ten Foundation Philippines Inc.</p>
        </div>
        <Outlet />
      </div>
    </div>
  )
}
