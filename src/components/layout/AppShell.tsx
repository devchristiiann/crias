import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'

export function AppShell() {
  return (
    <div className="min-h-full">
      <main className="mx-auto w-full max-w-lg px-4 pb-24 pt-6">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
