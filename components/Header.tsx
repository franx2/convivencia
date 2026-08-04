'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Brand } from '@/components/Brand'

export function Header() {
  const { user, signOut } = useAuth()
  const router = useRouter()

  async function handleSignOut() {
    await signOut()
    router.replace('/login')
  }

  return (
    <header className="border-b border-slate-200 bg-white dark:border-[#262626] dark:bg-black">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Brand />
        <div className="flex items-center gap-3 text-sm">
          <ThemeToggle />
          {user && (
            <>
              <span className="hidden text-slate-500 sm:inline dark:text-[#a8a8ad]">{user.email}</span>
              <button
                onClick={handleSignOut}
                className="text-slate-500 hover:text-red-600 dark:text-[#a8a8ad] dark:hover:text-red-400"
              >
                Salir
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
