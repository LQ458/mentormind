'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { Language, t } from '../lib/translations'

interface LanguageContextType {
    language: Language
    setLanguage: (lang: Language) => void
    t: (path: string, variables?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [language, setLanguageState] = useState<Language>('zh')
    const [isLoaded, setIsLoaded] = useState(false)

    // Load language from localStorage on mount
    useEffect(() => {
        const savedLanguage = localStorage.getItem('app-language') as Language
        if (savedLanguage && (savedLanguage === 'en' || savedLanguage === 'zh')) {
            setLanguageState(savedLanguage)
        }
        setIsLoaded(true)
    }, [])

    const setLanguage = (lang: Language) => {
        setLanguageState(lang)
        localStorage.setItem('app-language', lang)
        // Optional: update html lang attribute
        document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
    }

    const translate = (path: string, variables?: Record<string, string | number>) => {
        return t(path, language, variables)
    }

    // Prevent flash of untranslated content if necessary, 
    // though for simple apps default 'zh' is usually fine
    const value = {
        language,
        setLanguage,
        t: translate
    }

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    )
}

export function useLanguage() {
    const context = useContext(LanguageContext)
    if (context === undefined) {
        throw new Error('useLanguage must be used within a LanguageProvider')
    }
    return context
}
