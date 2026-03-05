'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { Language, t } from '../lib/translations'

interface LanguageContextType {
    // UI language — controls all static interface text (nav, buttons, labels)
    language: Language
    setLanguage: (lang: Language) => void

    // Content language — controls what language AI generates lessons in
    // By default mirrors UI language; can be overridden independently
    contentLanguage: Language
    setContentLanguage: (lang: Language, independent?: boolean) => void

    // Whether contentLanguage has been independently overridden from uiLanguage
    isContentLanguageOverridden: boolean

    // UI translation helper
    t: (path: string, variables?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [language, setLanguageState] = useState<Language>('zh')
    const [contentLanguage, setContentLanguageState] = useState<Language>('zh')
    const [isContentLanguageOverridden, setIsContentLanguageOverridden] = useState(false)

    // Load language preferences from localStorage on mount
    useEffect(() => {
        const savedUiLang = localStorage.getItem('app-language') as Language
        const savedContentLang = localStorage.getItem('content-language') as Language
        const savedOverride = localStorage.getItem('content-language-override') === 'true'

        if (savedUiLang && (savedUiLang === 'en' || savedUiLang === 'zh')) {
            setLanguageState(savedUiLang)
        }
        if (savedContentLang && (savedContentLang === 'en' || savedContentLang === 'zh')) {
            setContentLanguageState(savedContentLang)
            setIsContentLanguageOverridden(savedOverride)
        }
    }, [])

    // Set UI language — also updates content language unless independently overridden
    const setLanguage = (lang: Language) => {
        setLanguageState(lang)
        localStorage.setItem('app-language', lang)
        document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'

        // Sync content language unless user has independently overridden it
        if (!isContentLanguageOverridden) {
            setContentLanguageState(lang)
            localStorage.setItem('content-language', lang)
        }
    }

    // Set content language independently (independent=true) or in sync with UI
    const setContentLanguage = (lang: Language, independent = false) => {
        setContentLanguageState(lang)
        localStorage.setItem('content-language', lang)
        setIsContentLanguageOverridden(independent)
        localStorage.setItem('content-language-override', String(independent))
    }

    const translate = (path: string, variables?: Record<string, string | number>) => {
        return t(path, language, variables)
    }

    const value: LanguageContextType = {
        language,
        setLanguage,
        contentLanguage,
        setContentLanguage,
        isContentLanguageOverridden,
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
