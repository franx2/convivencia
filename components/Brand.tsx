import Link from 'next/link'

export function Brand({ href = '/', centered = false }: { href?: string; centered?: boolean }) {
  return (
    <Link
      href={href}
      aria-label="covivencia."
      className={`inline-flex items-center gap-2 text-emerald-800 dark:text-emerald-300 ${centered ? 'justify-center' : ''}`}
    >
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-700 text-lg font-black leading-none text-white shadow-sm">c.</span>
      <span className="text-xl font-bold tracking-normal">covivencia.</span>
    </Link>
  )
}
