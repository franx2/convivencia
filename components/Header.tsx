'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Brand } from '@/components/Brand'

/**
 * En el celular, tema y "Salir" viven en Config. (barra inferior): acá eran dos
 * blancos chicos, y "Salir" quedaba a un dedo de cerrar la sesión sin querer.
 * Las pantallas sin barra inferior piden `accountOnPhone` para no dejar sin salida.
 */
export function Header({ accountOnPhone = false }: { accountOnPhone?: boolean }) {
  const { user, signOut } = useAuth()
  const router = useRouter()

  async function handleSignOut() {
    await signOut()
    router.replace('/login')
  }

  return (
    <header className="border-b border-slate-200 bg-white pt-[env(safe-area-inset-top)] dark:border-[#26312d] dark:bg-[#0b0e0d]">
      <div className="mx-auto flex min-h-14 max-w-3xl items-center justify-between px-4 py-2">
        <Brand />
        <div className={`items-center gap-3 text-sm ${accountOnPhone ? 'flex' : 'hidden sm:flex'}`}>
          <ThemeToggle />
          {user && (
            <>
              <span className="hidden text-muted sm:inline">{user.email}</span>
              <button
                onClick={handleSignOut}
                className="inline-flex min-h-11 items-center px-1 text-muted hover:text-red-600 dark:hover:text-red-300"
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
