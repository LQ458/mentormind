export type Language = 'zh' | 'en'

export interface AppTranslations {
    nav: {
        dashboard: string
        create: string
        lessons: string
        analytics: string
        settings: string
    }
    create: {
        chatTitle: string
        chatPlaceholder: string
        sendButton: string
        assistantName: string
        userName: string
        topicSelectionTitle: string
        topicSelectionDescription: string
        recommendationLabel: string
        clarificationQuestionsLabel: string
        andMoreQuestions: string
        backToChatButton: string
        confirmSelectionButton: string
        formTitle: string
        studentQueryLabel: string
        studentQueryPlaceholder: string
        studentQueryHint: string
        studentLevelLabel: string
        studentLevelOptions: {
            beginner: string
            intermediate: string
            advanced: string
        }
        durationLabel: string
        additionalOptionsTitle: string
        includeVideoLabel: string
        includeVideoDescription: string
        languageLabel: string
        languageOptions: {
            zh: string
            en: string
        }
        generateButton: string
        previewTitle: string
        lessonCreationComplete: string
        personalizedLessonGenerated: string
        processingTime: string
        seconds: string
        qualityScoreLabel: string
        costLabel: string
        lessonTitleLabel: string
        includesVideoLabel: string
        viewDetailsButton: string
        createAnotherButton: string
        analysisFailed: string
        generationFailed: string
        enterLearningQuestion: string
        selectAtLeastOneTopic: string
        generateCourseFirst: string
        courseCreatedSuccess: string
        creationFailed: string
        unknownError: string
        creationFailedRetry: string
        courseSaved: string
        saveCourseButton: string
        analyzing: string
        generating: string
    }
    analytics: {
        pageTitle: string
        pageDescription: string
        timeRangeLabel: string
        timeRangeOptions: {
            '1d': string
            '7d': string
            '30d': string
            '90d': string
        }
        totalLessons: string
        totalCost: string
        avgQuality: string
        dailyAvg: string
        dailyLessonVolume: string
        serviceUsageDistribution: string
        subscriptionValueAnalysis: string
        qualityMetrics: string
        deepseek: string
        funasr: string
        paddle_ocr: string
        tts: string
        monthlyCost: string
        costPerLesson: string
        yourCostPerLesson: string
        savings: string
        clarity: string
        completeness: string
        engagement: string
        practicality: string
        recommendationsTitle: string
        costEfficiency: string
        costEfficiencyDetail: string
        increaseLessonComplexity: string
        increaseLessonComplexityDetail: string
        peakUsage: string
        peakUsageDetail: string
        loading: string
        noAnalyticsData: string
        noAnalyticsDescription: string
        excellentQuality: string
        lessonsPerDay: string
        remaining: string
        basedOnUsage: string
        professionalPlan: string
        thisMonth: string
    }
    settings: {
        pageTitle: string
        pageDescription: string
        saveChanges: string
        saving: string
        subscription: string
        preferences: string
        billing: string
        currentPlan: string
        renewsOn: string
        usageStats: string
        lessonsUsed: string
        remaining: string
        costThisMonth: string
        planFeatures: string
        availablePlans: string
        currentPlanButton: string
        upgradeButton: string
        switchToPlan: string
        basic: string
        professional: string
        enterprise: string
        basicFeatures: string[]
        proFeatures: string[]
        enterpriseFeatures: string[]
        dangerZone: string
        cancelSubscriptionWarning: string
        cancelSubscriptionButton: string
        defaultLanguage: string
        defaultLanguageDescription: string
        minimumQualityThreshold: string
        qualityThresholdDescription: string
        autoGenerateVideoLessons: string
        autoGenerateVideoDescription: string
        emailNotifications: string
        emailNotificationsDescription: string
        chineseSimplified: string
        englishUS: string
        japanese: string
        korean: string
        billingInformation: string
        billingEmail: string
        billingEmailDescription: string
        paymentMethod: string
        billingAddress: string
        updateButton: string
        billingHistory: string
        date: string
        description: string
        amount: string
        status: string
        invoice: string
        active: string
        paid: string
        download: string
        settingsSaved: string
        settingsSaveFailed: string
        upgradeConfirm: string
        upgradeRequested: string
        cancelConfirm: string
        cancellationRequested: string
    }
    common: {
        home: string
        loading: string
        error: string
        save: string
        cancel: string
        delete: string
        reset: string
        back: string
        next: string
        confirm: string
        success: string
        search: string
        allLessons: string
        view: string
        download: string
        close: string
        minutes: string
        remainingLessons: string
    }
    home: {
        heroTitle: string
        heroSubtitle: string
        startCreating: string
        viewDashboard: string
        featuresTitle: string
        feature1Title: string
        feature1Desc: string
        feature2Title: string
        feature2Desc: string
        feature3Title: string
        feature3Desc: string
        quickAccessTitle: string
        createLesson: string
        createLessonDesc: string
        lessonManagement: string
        lessonManagementDesc: string
        analyticsLink: string
        analyticsLinkDesc: string
        settingsLink: string
        settingsLinkDesc: string
        systemStatusTitle: string
        online: string
        connected: string
        simulated: string
        offline: string
    }
    dashboard: {
        pageTitle: string
        pageSubtitle: string
        lastUpdated: string
        quickActions: string
        createNewLesson: string
        viewAllLessons: string
        viewAnalytics: string
        systemStatus: string
        backendService: string
        aiLessons: string
        lessonsUsedLabel: string
        monthlyCostLabel: string
        renewalDateLabel: string
        online: string
        offline: string
        normal: string
        maintenance: string
        recentLessons: string
        viewAll: string
        noLessonsYet: string
        noLessonsHint: string
        subscriptionUsage: string
        currentPlan: string
        proName: string
        proPrice: string
        thisMonthLessons: string
        usedPercent: string
        remainingLessons: string
        costEfficiency: string
        usedThisMonth: string
        percentOfBudget: string
        needMore: string
        upgradeDesc: string
        upgradePlan: string
        timeHeader: string
        studentQueryHeader: string
        lessonTitleHeader: string
        qualityHeader: string
        costHeader: string
    }
    lessons: {
        pageTitle: string
        pageSubtitle: string
        totalCount: string
        deleteAll: string
        createNew: string
        createNewDesc: string
        startCreating: string
        batchImport: string
        batchImportDesc: string
        uploadFile: string
        exportLessons: string
        exportLessonsDesc: string
        selectLesson: string
        allLessonsHeader: string
        dateTimeHeader: string
        studentQueryHeader: string
        lessonTitleHeader: string
        qualityHeader: string
        costHeader: string
        actionsHeader: string
        viewAction: string
        deleteAction: string
        noLessonsTitle: string
        noLessonsDesc: string
        createLessonButton: string
        loading: string
        detailsTitle: string
        studentQueryLabel: string
        lessonTitleLabel: string
        generatedLabel: string
        qualityScoreLabel: string
        costLabel: string
        lessonIdLabel: string
        closeButton: string
        downloadButton: string
        deleteConfirm: string
        deleteAllConfirm1: string
        deleteAllConfirm2: string
        deletedSuccess: string
        deleteFailed: string
        deleteAllFailed: string
    }
    lessonDetail: {
        downloadPdf: string
        startQuiz: string
        tabLessonPlan: string
        tabTranscript: string
        tabAiInsights: string
        learningObjectives: string
        coreConcepts: string
        noObjectives: string
        noScript: string
        noExternalResources: string
        aiTeacherConfidence: string
        basedOnTopicAnalysis: string
        pedagogicalApproach: string
        noVideoAvailable: string
        noVideoDesc: string
        yourProgress: string
        completion: string
        markComplete: string
        resources: string
        externalResource: string
        browserNoVideo: string
    }
}

export const translations: Record<Language, AppTranslations> = {
    zh: {
        nav: {
            dashboard: '仪表板',
            create: '创建课程',
            lessons: '课程管理',
            analytics: '数据分析',
            settings: '账户设置',
        },
        create: {
            chatTitle: 'AI学习导师对话',
            chatPlaceholder: '告诉我你想学习什么...',
            sendButton: '发送',
            assistantName: 'AI导师',
            userName: '你',
            topicSelectionTitle: '选择学习主题',
            topicSelectionDescription: '基于对话分析，我为你推荐以下学习主题：',
            recommendationLabel: '推荐度',
            clarificationQuestionsLabel: '澄清问题',
            andMoreQuestions: '还有 {count} 个问题...',
            backToChatButton: '返回对话',
            confirmSelectionButton: '确认选择 ({count})',
            formTitle: '学生问题',
            studentQueryLabel: '学生想要学习什么？',
            studentQueryPlaceholder: '例如：我想学习Python编程，从哪里开始？',
            studentQueryHint: '用中文描述学习需求，AI会生成最适合的教学方案',
            studentLevelLabel: '学生水平',
            studentLevelOptions: {
                beginner: '初级',
                intermediate: '中级',
                advanced: '高级'
            },
            durationLabel: '课程时长（分钟）',
            additionalOptionsTitle: '附加选项',
            includeVideoLabel: '生成视频课程',
            includeVideoDescription: '包含AI虚拟教师和语音讲解',
            languageLabel: '教学语言',
            languageOptions: { zh: '中文', en: '英文' },
            generateButton: '生成教学方案',
            previewTitle: '课程预览',
            lessonCreationComplete: '课程创建完成',
            personalizedLessonGenerated: '个性化教学课程已生成',
            processingTime: '处理时间',
            seconds: '秒',
            qualityScoreLabel: '质量评分',
            costLabel: '成本',
            lessonTitleLabel: '课程标题',
            includesVideoLabel: '包含视频',
            viewDetailsButton: '查看详情',
            createAnotherButton: '创建新课程',
            analysisFailed: '分析遇到了一些问题，但我还是为你准备了一些通用学习主题。',
            generationFailed: '生成教学方案时遇到问题，请稍后重试。',
            enterLearningQuestion: '请输入学习问题',
            selectAtLeastOneTopic: '请至少选择一个主题',
            generateCourseFirst: '请先生成课程',
            courseCreatedSuccess: '课程创建成功！',
            creationFailed: '创建失败：',
            unknownError: '未知错误',
            creationFailedRetry: '创建失败，请重试',
            courseSaved: '课程已保存！',
            saveCourseButton: '保存课程',
            analyzing: '正在分析你的学习需求...',
            generating: '正在生成教学方案...'
        },
        analytics: {
            pageTitle: '数据分析',
            pageDescription: '使用统计和成本分析',
            timeRangeLabel: '时间范围',
            timeRangeOptions: { '1d': '1天', '7d': '7天', '30d': '30天', '90d': '90天' },
            totalLessons: '总课程数',
            totalCost: '总成本',
            avgQuality: '平均质量',
            dailyAvg: '日均',
            dailyLessonVolume: '每日课程量',
            serviceUsageDistribution: '服务使用分布',
            subscriptionValueAnalysis: '订阅价值分析',
            qualityMetrics: '质量指标',
            deepseek: 'DeepSeek',
            funasr: 'FunASR',
            paddle_ocr: 'PaddleOCR',
            tts: '文字转语音',
            monthlyCost: '月费',
            costPerLesson: '市场价/课',
            yourCostPerLesson: '您的均价/课',
            savings: '节省金额',
            clarity: '清晰度',
            completeness: '完整性',
            engagement: '参与度',
            practicality: '实用性',
            recommendationsTitle: '建议',
            costEfficiency: '成本效率优秀',
            costEfficiencyDetail: '您仅使用了月度预算的2.1%，同时保持了高质量输出。',
            increaseLessonComplexity: '考虑增加课程复杂度',
            increaseLessonComplexityDetail: '质量评分很高 - 您可以处理更高级的主题。',
            peakUsage: '高峰使用时间：上午9点 - 11点',
            peakUsageDetail: '考虑在非高峰时段安排批量处理。',
            loading: '加载分析数据中...',
            noAnalyticsData: '无分析数据',
            noAnalyticsDescription: '生成一些课程以查看分析数据',
            excellentQuality: '优秀质量',
            lessonsPerDay: '课程/天',
            remaining: '剩余',
            basedOnUsage: '基于使用情况',
            professionalPlan: '专业版',
            thisMonth: '本月'
        },
        settings: {
            pageTitle: '账户设置',
            pageDescription: '管理您的订阅和偏好设置',
            saveChanges: '保存更改',
            saving: '保存中...',
            subscription: '订阅',
            preferences: '偏好设置',
            billing: '账单',
            currentPlan: '当前计划',
            renewsOn: '续订日期',
            usageStats: '使用统计',
            lessonsUsed: '已使用课程',
            remaining: '剩余',
            costThisMonth: '本月成本',
            planFeatures: '计划功能',
            availablePlans: '可用计划',
            currentPlanButton: '当前计划',
            upgradeButton: '升级',
            switchToPlan: '切换到计划',
            basic: '基础版',
            professional: '专业版',
            enterprise: '企业版',
            basicFeatures: ['100 课程/月', '30分钟最大时长', '邮件支持', '标准质量'],
            proFeatures: ['1000 课程/月', '60分钟最大时长', '优先支持', '高质量', '视频生成'],
            enterpriseFeatures: ['无限课程', '无限时长', '24/7 支持', '最高质量', '自定义头像', 'API 访问'],
            dangerZone: '危险区域',
            cancelSubscriptionWarning: '取消订阅将停止自动续订。您仍然可以访问直到计费周期结束。',
            cancelSubscriptionButton: '取消订阅',
            defaultLanguage: '默认语言',
            defaultLanguageDescription: '生成课程内容的默认语言',
            minimumQualityThreshold: '最低质量阈值',
            qualityThresholdDescription: '低于此分数的课程将被标记为需要审核',
            autoGenerateVideoLessons: '自动生成视频课程',
            autoGenerateVideoDescription: '自动创建带有头像的视频输出',
            emailNotifications: '邮件通知',
            emailNotificationsDescription: '接收关于课程和使用的邮件更新',
            chineseSimplified: '中文（简体）',
            englishUS: '英文（美国）',
            japanese: '日语',
            korean: '韩语',
            billingInformation: '账单信息',
            billingEmail: '账单邮箱',
            billingEmailDescription: '发票和收据将发送到此邮箱',
            paymentMethod: '支付方式',
            billingAddress: '账单地址',
            updateButton: '更新',
            billingHistory: '账单历史',
            date: '日期',
            description: '描述',
            amount: '金额',
            status: '状态',
            invoice: '发票',
            active: '激活',
            paid: '已支付',
            download: '下载',
            settingsSaved: '设置保存成功！',
            settingsSaveFailed: '保存设置失败',
            upgradeConfirm: '升级到 {planId} 计划？这将在您的下一个计费周期生效。',
            upgradeRequested: '计划升级已请求！',
            cancelConfirm: '确定要取消订阅吗？',
            cancellationRequested: '订阅取消已请求。'
        },
        common: {
            home: '首页',
            loading: '加载中...',
            error: '出错了',
            save: '保存',
            cancel: '取消',
            delete: '删除',
            reset: '重置',
            back: '返回',
            next: '下一步',
            confirm: '确认',
            success: '成功',
            search: '搜索',
            allLessons: '所有课程',
            view: '查看',
            download: '下载',
            close: '关闭',
            minutes: '分钟',
            remainingLessons: '剩余课时：{count}'
        },
        home: {
            heroTitle: 'MentorMind AI 教学助手',
            heroSubtitle: 'AI驱动的个性化教学平台，为中国市场量身定制',
            startCreating: '开始创建课程',
            viewDashboard: '查看仪表板',
            featuresTitle: '核心功能',
            feature1Title: 'AI沉浸式课程',
            feature1Desc: '使用DeepSeek AI生成个性化教学方案，针对中国市场优化',
            feature2Title: '语音与文字处理',
            feature2Desc: '集成FunASR中文语音识别和PaddleOCR文字提取',
            feature3Title: '订阅方案',
            feature3Desc: '简单的月度订阅方案，价格透明可预期',
            quickAccessTitle: '快捷入口',
            createLesson: '创建课程',
            createLessonDesc: 'AI生成教学',
            lessonManagement: '课程管理',
            lessonManagementDesc: '查看与编辑',
            analyticsLink: '数据分析',
            analyticsLinkDesc: '用量与费用',
            settingsLink: '账户设置',
            settingsLinkDesc: '配置管理',
            systemStatusTitle: '系统状态',
            online: '在线',
            connected: '已连接',
            simulated: '模拟中',
            offline: '离线',
        },
        dashboard: {
            pageTitle: '仪表板',
            pageSubtitle: '系统概览与快捷操作',
            lastUpdated: '最后更新',
            quickActions: '快捷操作',
            createNewLesson: '创建新课程',
            viewAllLessons: '查看所有课程',
            viewAnalytics: '查看数据分析',
            systemStatus: '系统状态',
            backendService: '后端服务',
            aiLessons: 'AI课程生成',
            lessonsUsedLabel: '已用课时',
            monthlyCostLabel: '月度费用',
            renewalDateLabel: '续费日期',
            online: '在线',
            offline: '离线',
            normal: '正常',
            maintenance: '维护中',
            recentLessons: '最近课程',
            viewAll: '查看全部 →',
            noLessonsYet: '尚未生成任何课程。',
            noLessonsHint: '点击"创建新课程"开始您的第一课。',
            subscriptionUsage: '订阅使用情况',
            currentPlan: '当前套餐',
            proName: '专业版',
            proPrice: '$29.99/月',
            thisMonthLessons: '本月课时',
            usedPercent: '已使用{pct}%',
            remainingLessons: '剩余{n}课时',
            costEfficiency: '成本效率',
            usedThisMonth: '本月已使用',
            percentOfBudget: '仅占月度费用{pct}%',
            needMore: '需要更多课时？',
            upgradeDesc: '升级到企业版获得无限使用',
            upgradePlan: '升级套餐',
            timeHeader: '时间',
            studentQueryHeader: '学生问题',
            lessonTitleHeader: '课程标题',
            qualityHeader: '质量',
            costHeader: '成本',
        },
        lessons: {
            pageTitle: '课程管理',
            pageSubtitle: 'AI生成课程的创建与管理',
            totalCount: '共 {n} 课程',
            deleteAll: '全部删除',
            createNew: '创建新课程',
            createNewDesc: 'AI生成个性化教学',
            startCreating: '开始创建 →',
            batchImport: '批量导入',
            batchImportDesc: '从文件导入学生问题',
            uploadFile: '上传文件 →',
            exportLessons: '导出课程',
            exportLessonsDesc: '批量导出为PDF/视频',
            selectLesson: '选择课程 →',
            allLessonsHeader: '全部课程',
            dateTimeHeader: '日期与时间',
            studentQueryHeader: '学生问题',
            lessonTitleHeader: '课程标题',
            qualityHeader: '质量',
            costHeader: '费用',
            actionsHeader: '操作',
            viewAction: '查看',
            deleteAction: '删除',
            noLessonsTitle: '暂无课程',
            noLessonsDesc: '点击创建您的第一课',
            createLessonButton: '创建课程',
            loading: '加载中...',
            detailsTitle: '课程详情',
            studentQueryLabel: '学生问题',
            lessonTitleLabel: '课程标题',
            generatedLabel: '生成时间',
            qualityScoreLabel: '质量分数',
            costLabel: '费用',
            lessonIdLabel: '课程 ID',
            closeButton: '关闭',
            downloadButton: '下载课程',
            deleteConfirm: '确定要删除这课课程吗？',
            deleteAllConfirm1: '确定要删除所有课程？此操作无法撤销。',
            deleteAllConfirm2: '确定要全部删除吗？',
            deletedSuccess: '已成功删除所有课程。',
            deleteFailed: '删除失败',
            deleteAllFailed: '删除全部课程失败',
        },
        lessonDetail: {
            downloadPdf: '下载PDF',
            startQuiz: '开始测验',
            tabLessonPlan: '课程计划',
            tabTranscript: '脚本与字幕',
            tabAiInsights: 'AI洞察',
            learningObjectives: '学习目标',
            coreConcepts: '核心概念',
            noObjectives: '暂无目标',
            noScript: '暂无脚本',
            noExternalResources: '暂无外部资源',
            aiTeacherConfidence: 'AI教师置信度',
            basedOnTopicAnalysis: '基于主题分析',
            pedagogicalApproach: '教学方法',
            noVideoAvailable: '暂无视频',
            noVideoDesc: '该课程未生成视频内容。',
            yourProgress: '您的进度',
            completion: '完成度',
            markComplete: '标记为完成',
            resources: '资源',
            externalResource: '外部资源',
            browserNoVideo: '您的浏览器不支持视频播放。',
        }
    },
    en: {
        nav: {
            dashboard: 'Dashboard',
            create: 'Create Lesson',
            lessons: 'Lessons',
            analytics: 'Analytics',
            settings: 'Settings',
        },
        create: {
            chatTitle: 'AI Learning Mentor Conversation',
            chatPlaceholder: 'Tell me what you want to learn...',
            sendButton: 'Send',
            assistantName: 'AI Mentor',
            userName: 'You',
            topicSelectionTitle: 'Select Learning Topics',
            topicSelectionDescription: 'Based on conversation analysis, I recommend the following learning topics:',
            recommendationLabel: 'Recommendation',
            clarificationQuestionsLabel: 'Clarification Questions',
            andMoreQuestions: 'and {count} more questions...',
            backToChatButton: 'Back to Chat',
            confirmSelectionButton: 'Confirm Selection ({count})',
            formTitle: 'Student Question',
            studentQueryLabel: 'What does the student want to learn?',
            studentQueryPlaceholder: 'e.g., I want to learn Python programming, where should I start?',
            studentQueryHint: 'Describe learning needs, AI will generate the most suitable teaching plan',
            studentLevelLabel: 'Student Level',
            studentLevelOptions: {
                beginner: 'Beginner',
                intermediate: 'Intermediate',
                advanced: 'Advanced'
            },
            durationLabel: 'Lesson Duration (minutes)',
            additionalOptionsTitle: 'Additional Options',
            includeVideoLabel: 'Generate Video Lesson',
            includeVideoDescription: 'Includes AI virtual teacher and voice explanation',
            languageLabel: 'Teaching Language',
            languageOptions: { zh: 'Chinese', en: 'English' },
            generateButton: 'Generate Teaching Plan',
            previewTitle: 'Lesson Preview',
            lessonCreationComplete: 'Lesson Creation Complete',
            personalizedLessonGenerated: 'Personalized teaching lesson has been generated',
            processingTime: 'Processing Time',
            seconds: 'seconds',
            qualityScoreLabel: 'Quality Score',
            costLabel: 'Cost',
            lessonTitleLabel: 'Lesson Title',
            includesVideoLabel: 'Includes Video',
            viewDetailsButton: 'View Details',
            createAnotherButton: 'Create Another Lesson',
            analysisFailed: 'The analysis encountered some issues, but I have prepared some general learning topics for you.',
            generationFailed: 'Encountered a problem while generating the teaching plan, please try again later.',
            enterLearningQuestion: 'Please enter a learning question',
            selectAtLeastOneTopic: 'Please select at least one topic',
            generateCourseFirst: 'Please generate the course first',
            courseCreatedSuccess: 'Course created successfully!',
            creationFailed: 'Failed to create course: ',
            unknownError: 'Unknown error',
            creationFailedRetry: 'Course creation failed, please try again',
            courseSaved: 'Course saved successfully',
            saveCourseButton: 'Save Course',
            analyzing: 'Analyzing...',
            generating: 'Generating...'
        },
        analytics: {
            pageTitle: 'Analytics',
            pageDescription: 'Usage statistics and cost analysis',
            timeRangeLabel: 'Time Range',
            timeRangeOptions: { '1d': 'Last 24h', '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days' },
            totalLessons: 'Total Lessons',
            totalCost: 'Total Cost',
            avgQuality: 'Avg Quality',
            dailyAvg: 'Daily Average',
            dailyLessonVolume: 'Daily Lesson Volume',
            serviceUsageDistribution: 'Service Usage Distribution',
            subscriptionValueAnalysis: 'Subscription Value Analysis',
            qualityMetrics: 'Quality Metrics',
            deepseek: 'DeepSeek',
            funasr: 'FunASR',
            paddle_ocr: 'PaddleOCR',
            tts: 'TTS',
            monthlyCost: 'Monthly Cost',
            costPerLesson: 'Market Rate / Lesson',
            yourCostPerLesson: 'Your Cost / Lesson',
            savings: 'Savings',
            clarity: 'Clarity',
            completeness: 'Completeness',
            engagement: 'Engagement',
            practicality: 'Practicality',
            recommendationsTitle: 'Recommendations',
            costEfficiency: 'Cost Efficiency',
            costEfficiencyDetail: 'Your average cost per lesson is significantly below market rate.',
            increaseLessonComplexity: 'Increase Lesson Complexity',
            increaseLessonComplexityDetail: 'Consider adding more interactive elements to improve engagement.',
            peakUsage: 'Peak Usage',
            peakUsageDetail: 'Most lessons are generated on weekdays. Consider scheduling on weekends.',
            loading: 'Loading analytics...',
            noAnalyticsData: 'No Analytics Data',
            noAnalyticsDescription: 'Generate some lessons first to see analytics.',
            excellentQuality: 'Excellent Quality',
            lessonsPerDay: 'lessons/day',
            remaining: 'remaining',
            basedOnUsage: 'Based on usage',
            professionalPlan: 'Professional Plan',
            thisMonth: 'this month',
        },
        settings: {
            pageTitle: 'Settings',
            pageDescription: 'Manage your account and preferences',
            saveChanges: 'Save Changes',
            saving: 'Saving...',
            subscription: 'Subscription',
            preferences: 'Preferences',
            billing: 'Billing',
            currentPlan: 'Current Plan',
            renewsOn: 'Renews on',
            usageStats: 'Usage Statistics',
            lessonsUsed: 'Lessons Used',
            remaining: 'Remaining',
            costThisMonth: 'Cost This Month',
            planFeatures: 'Plan Features',
            availablePlans: 'Available Plans',
            currentPlanButton: 'Current Plan',
            upgradeButton: 'Upgrade',
            switchToPlan: 'Switch to {planId}',
            basic: 'Basic',
            professional: 'Professional',
            enterprise: 'Enterprise',
            basicFeatures: ['100 lessons/month', 'Standard AI quality', 'Email support'],
            proFeatures: ['1,000 lessons/month', 'High AI quality', 'Priority support', 'Video lessons'],
            enterpriseFeatures: ['Unlimited lessons', 'Maximum AI quality', '24/7 support', 'Custom integration'],
            dangerZone: 'Danger Zone',
            cancelSubscriptionWarning: 'This will cancel your subscription at the end of the billing period.',
            cancelSubscriptionButton: 'Cancel Subscription',
            defaultLanguage: 'Default Language',
            defaultLanguageDescription: 'Language used for AI-generated content',
            minimumQualityThreshold: 'Minimum Quality Threshold',
            qualityThresholdDescription: 'Lessons below this threshold will be regenerated',
            autoGenerateVideoLessons: 'Auto-generate Video Lessons',
            autoGenerateVideoDescription: 'Automatically create video versions of lessons',
            emailNotifications: 'Email Notifications',
            emailNotificationsDescription: 'Receive email updates for lesson generation',
            chineseSimplified: 'Chinese (Simplified)',
            englishUS: 'English (US)',
            japanese: 'Japanese',
            korean: 'Korean',
            billingInformation: 'Billing Information',
            billingEmail: 'Billing Email',
            billingEmailDescription: 'Email address for invoices and billing notifications',
            paymentMethod: 'Payment Method',
            billingAddress: 'Billing Address',
            updateButton: 'Update',
            billingHistory: 'Billing History',
            date: 'Date',
            description: 'Description',
            amount: 'Amount',
            status: 'Status',
            invoice: 'Invoice',
            active: 'Active',
            paid: 'Paid',
            download: 'Download',
            settingsSaved: 'Settings saved successfully!',
            settingsSaveFailed: 'Failed to save settings',
            upgradeConfirm: 'Upgrade to {planId} plan? This will take effect on your next billing cycle.',
            upgradeRequested: 'Plan upgrade requested!',
            cancelConfirm: 'Are you sure you want to cancel your subscription?',
            cancellationRequested: 'Subscription cancellation requested.'
        },
        common: {
            home: 'Home',
            loading: 'Loading...',
            error: 'Error',
            save: 'Save',
            cancel: 'Cancel',
            delete: 'Delete',
            reset: 'Reset',
            back: 'Back',
            next: 'Next',
            confirm: 'Confirm',
            success: 'Success',
            search: 'Search',
            allLessons: 'All Lessons',
            view: 'View',
            download: 'Download',
            close: 'Close',
            minutes: 'minutes',
            remainingLessons: 'Remaining lessons: {count}'
        },
        home: {
            heroTitle: 'MentorMind AI Teaching Assistant',
            heroSubtitle: 'AI-driven personalized teaching platform, optimized for the China market',
            startCreating: 'Start Creating Lessons',
            viewDashboard: 'View Dashboard',
            featuresTitle: 'Core Features',
            feature1Title: 'AI-Powered Lessons',
            feature1Desc: 'Generate personalized lesson plans using DeepSeek AI with Chinese market optimization',
            feature2Title: 'Speech & Text Processing',
            feature2Desc: 'Integrated FunASR for speech recognition and PaddleOCR for text extraction',
            feature3Title: 'Subscription Plans',
            feature3Desc: 'Simple monthly plans with predictable pricing',
            quickAccessTitle: 'Quick Access',
            createLesson: 'Create Lesson',
            createLessonDesc: 'AI-generated teaching',
            lessonManagement: 'Lesson Management',
            lessonManagementDesc: 'View & edit',
            analyticsLink: 'Analytics',
            analyticsLinkDesc: 'Usage & costs',
            settingsLink: 'Settings',
            settingsLinkDesc: 'Configuration',
            systemStatusTitle: 'System Status',
            online: 'Online',
            connected: 'Connected',
            simulated: 'Simulated',
            offline: 'Offline',
        },
        dashboard: {
            pageTitle: 'Dashboard',
            pageSubtitle: 'System overview and quick actions',
            lastUpdated: 'Last updated',
            quickActions: 'Quick Actions',
            createNewLesson: 'Create New Lesson',
            viewAllLessons: 'View All Lessons',
            viewAnalytics: 'View Analytics',
            systemStatus: 'System Status',
            backendService: 'Backend Service',
            aiLessons: 'AI Lesson Generation',
            lessonsUsedLabel: 'Lessons Used',
            monthlyCostLabel: 'Monthly Cost',
            renewalDateLabel: 'Renewal Date',
            online: 'Online',
            offline: 'Offline',
            normal: 'Normal',
            maintenance: 'Maintenance',
            recentLessons: 'Recent Lessons',
            viewAll: 'View All →',
            noLessonsYet: 'No lessons generated yet.',
            noLessonsHint: 'Click "Create New Lesson" to start your first lesson.',
            subscriptionUsage: 'Subscription Usage',
            currentPlan: 'Current Plan',
            proName: 'Professional',
            proPrice: '$29.99/mo',
            thisMonthLessons: 'This Month',
            usedPercent: 'Used {pct}%',
            remainingLessons: '{n} remaining',
            costEfficiency: 'Cost Efficiency',
            usedThisMonth: 'Used this month',
            percentOfBudget: '{pct}% of monthly budget',
            needMore: 'Need more lessons?',
            upgradeDesc: 'Upgrade to Enterprise for unlimited usage',
            upgradePlan: 'Upgrade Plan',
            timeHeader: 'Time',
            studentQueryHeader: 'Student Query',
            lessonTitleHeader: 'Lesson Title',
            qualityHeader: 'Quality',
            costHeader: 'Cost',
        },
        lessons: {
            pageTitle: 'Lessons',
            pageSubtitle: 'Create and manage AI-generated lessons',
            totalCount: 'Total: {n} lessons',
            deleteAll: 'Delete All',
            createNew: 'Create New Lesson',
            createNewDesc: 'AI-generated personalized teaching',
            startCreating: 'Start Creating →',
            batchImport: 'Batch Import',
            batchImportDesc: 'Import student queries from file',
            uploadFile: 'Upload File →',
            exportLessons: 'Export Lessons',
            exportLessonsDesc: 'Export as PDF/Video in bulk',
            selectLesson: 'Select Lesson →',
            allLessonsHeader: 'All Lessons',
            dateTimeHeader: 'Date & Time',
            studentQueryHeader: 'Student Query',
            lessonTitleHeader: 'Lesson Title',
            qualityHeader: 'Quality',
            costHeader: 'Cost',
            actionsHeader: 'Actions',
            viewAction: 'View',
            deleteAction: 'Delete',
            noLessonsTitle: 'No lessons yet',
            noLessonsDesc: 'Create your first lesson to get started',
            createLessonButton: 'Create Lesson',
            loading: 'Loading lessons...',
            detailsTitle: 'Lesson Details',
            studentQueryLabel: 'Student Query',
            lessonTitleLabel: 'Lesson Title',
            generatedLabel: 'Generated',
            qualityScoreLabel: 'Quality Score',
            costLabel: 'Cost',
            lessonIdLabel: 'Lesson ID',
            closeButton: 'Close',
            downloadButton: 'Download Lesson',
            deleteConfirm: 'Are you sure you want to delete this lesson?',
            deleteAllConfirm1: 'Are you sure you want to delete ALL lessons? This cannot be undone.',
            deleteAllConfirm2: 'Really delete everything?',
            deletedSuccess: 'All lessons deleted successfully.',
            deleteFailed: 'Failed to delete lesson',
            deleteAllFailed: 'Failed to delete all lessons',
        },
        lessonDetail: {
            downloadPdf: 'Download PDF',
            startQuiz: 'Start Quiz',
            tabLessonPlan: 'Lesson Plan',
            tabTranscript: 'Transcript & Script',
            tabAiInsights: 'AI Insights',
            learningObjectives: 'Learning Objectives',
            coreConcepts: 'Core Concepts',
            noObjectives: 'No objectives listed',
            noScript: 'No script available.',
            noExternalResources: 'No external resources',
            aiTeacherConfidence: 'AI Teacher Confidence',
            basedOnTopicAnalysis: 'Based on topic analysis',
            pedagogicalApproach: 'Pedagogical Approach',
            noVideoAvailable: 'No video available',
            noVideoDesc: 'This lesson was generated without video content.',
            yourProgress: 'Your Progress',
            completion: 'Completion',
            markComplete: 'Mark as Complete',
            resources: 'Resources',
            externalResource: 'External Resource',
            browserNoVideo: 'Your browser does not support the video tag.',
        }
    }
}

/**
 * Helper to get nested translation value
 */
export function t(path: string, language: Language = 'zh', variables?: Record<string, string | number>): string {
    const parts = path.split('.')
    let current: any = translations[language]

    for (const part of parts) {
        if (current[part] === undefined) {
            console.warn(`Translation path not found: ${path} in ${language}`)
            return path
        }
        current = current[part]
    }

    if (typeof current !== 'string') {
        return path
    }

    let text = current

    if (variables) {
        Object.entries(variables).forEach(([key, value]) => {
            text = text.replace(`{${key}}`, String(value))
        })
    }

    return text
}
