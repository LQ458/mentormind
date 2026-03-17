'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLanguage } from './LanguageContext'
import { useAuth } from './AuthContext'

export default function Navbar() {
    const { language, setLanguage, t } = useLanguage()
    const { isAuthenticated, user, logout } = useAuth()
    const pathname = usePathname()

    const navLinks = [
        { href: '/dashboard', label: t('nav.dashboard') },
        { href: '/create', label: t('nav.create') },
        { href: '/lessons', label: t('nav.lessons') },
        { href: '/analytics', label: t('nav.analytics') },
        { href: '/settings', label: t('nav.settings') },
    ]

    const toggleLanguage = () => {
        setLanguage(language === 'zh' ? 'en' : 'zh')
    }

    return (
        <header className="bg-white px-4 py-4 border-b border-gray-200 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4">
                <div className="flex justify-between items-center h-16">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                            <Link href="/" className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                                    <span className="text-white font-bold">M</span>
                                </div>
                                <span className="text-xl font-bold text-gray-900">MentorMind</span>
                            </Link>
                        </div>
                    </div>

                    <nav className="hidden md:flex items-center space-x-6">
                        {navLinks.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`text-sm font-medium transition-colors hover:text-blue-600 ${pathname === link.href ? 'text-blue-600' : 'text-gray-700'
                                    }`}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </nav>

                    {/* Auth Area */}
                    <div className="flex items-center space-x-4">
                        <button
                            onClick={toggleLanguage}
                            className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors hidden md:flex"
                        >
                            {language === 'zh' ? 'EN' : '中文'}
                        </button>
                        
                        {isAuthenticated ? (
                            <div className="flex items-center space-x-4">
                                <span className="text-sm font-medium text-gray-700 hidden sm:block">
                                    {user?.username}
                                </span>
                                <button
                                    onClick={logout}
                                    className="text-sm font-medium text-gray-600 hover:text-red-600 transition-colors"
                                >
                                    {language === 'zh' ? '退出' : 'Logout'}
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center space-x-3">
                                <Link
                                    href="/auth/login"
                                    className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
                                >
                                    {language === 'zh' ? '登录' : 'Sign in'}
                                </Link>
                                <Link
                                    href="/auth/register"
                                    className="text-sm font-medium px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    {language === 'zh' ? '注册' : 'Sign up'}
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </header>
    )
}
