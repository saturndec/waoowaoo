'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Navbar from '@/components/Navbar'
import ApiConfigTab from './components/ApiConfigTab'

interface BalanceInfo {
  balance: number
  frozenAmount: number
  totalSpent: number
}

interface Transaction {
  id: string
  type: 'recharge' | 'consume'
  amount: number
  balanceAfter: number
  description: string | null
  createdAt: string
}

interface TransactionPagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

interface ProjectCost {
  projectId: string
  projectName: string
  totalCost: number
  recordCount: number
}

interface CostByType {
  apiType: string
  _sum: { cost: number | null }
  _count: number
}

interface CostByAction {
  action: string
  _sum: { cost: number | null }
  _count: number
}

interface CostRecord {
  id: string
  apiType: string
  model: string
  action: string
  quantity: number
  unit: string
  cost: number
  createdAt: string
}

interface ProjectDetails {
  total: number
  byType: CostByType[]
  byAction: CostByAction[]
  recentRecords: CostRecord[]
}

// API 和操作类型的 key 列表用于翻译
const API_TYPES = ['image', 'video', 'text', 'tts', 'voice', 'voice_design', 'lip_sync'] as const
const ACTION_TYPES = [
  'storyboard', 'storyboard_candidate', 'character', 'location', 'video', 'analyze',
  'analyze_character', 'analyze_location', 'clips', 'storyboard_text_plan',
  'storyboard_text_detail', 'tts', 'regenerate', 'voice-generate', 'voice-design', 'lip-sync'
] as const

// 类型对应的颜色
const TYPE_COLORS: Record<string, { bg: string, text: string, border: string }> = {
  image: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-100' },
  video: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-100' },
  text: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100' },
  tts: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-100' },
  voice: { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-100' },
  voice_design: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-100' },
  lip_sync: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-100' },
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ProfilePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const t = useTranslations('profile')
  const tc = useTranslations('common')
  const tb = useTranslations('billing')
  const [balance, setBalance] = useState<BalanceInfo | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [transactionPagination, setTransactionPagination] = useState<TransactionPagination | null>(null)
  const [projects, setProjects] = useState<ProjectCost[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('all')
  const [projectDetails, setProjectDetails] = useState<ProjectDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailsLoading, setDetailsLoading] = useState(false)

  // 主要分区：扣费记录 / API配置
  const [activeSection, setActiveSection] = useState<'billing' | 'apiConfig'>('apiConfig')
  // 扣费记录内的子视图
  const [billingView, setBillingView] = useState<'transactions' | 'projects'>('transactions')
  const [projectViewMode, setProjectViewMode] = useState<'summary' | 'records'>('summary')
  const [recordsFilter, setRecordsFilter] = useState<string>('all')

  // 账户流水筛选和分页状态
  const [txPage, setTxPage] = useState(1)
  const [txType, setTxType] = useState<'all' | 'recharge' | 'consume'>('all')
  const [txStartDate, setTxStartDate] = useState<string>('')
  const [txEndDate, setTxEndDate] = useState<string>('')
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    if (status === 'loading') return
    if (!session) { router.push('/auth/signin'); return }
    fetchData()
  }, [session, status, router])

  useEffect(() => {
    if (session) {
      fetchTransactions()
    }
  }, [txPage, txType, txStartDate, txEndDate, session])

  useEffect(() => {
    if (selectedProject && selectedProject !== 'all') {
      fetchProjectDetails(selectedProject)
      setProjectViewMode('summary')
      setRecordsFilter('all')
    }
  }, [selectedProject])

  async function fetchData() {
    setLoading(true)
    try {
      const [balanceRes, costsRes] = await Promise.all([
        fetch('/api/user/balance'),
        fetch('/api/user/costs')
      ])
      if (balanceRes.ok) setBalance(await balanceRes.json())
      if (costsRes.ok) {
        const data = await costsRes.json()
        setProjects(data.byProject || [])
      }
      await fetchTransactions()
    } catch (error) {
      console.error('获取数据失败:', error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchTransactions() {
    try {
      const params = new URLSearchParams({
        page: txPage.toString(),
        pageSize: '20',
      })
      if (txType !== 'all') params.append('type', txType)
      if (txStartDate) params.append('startDate', txStartDate)
      if (txEndDate) params.append('endDate', txEndDate)

      const res = await fetch(`/api/user/transactions?${params}`)
      if (res.ok) {
        const data = await res.json()
        setTransactions(data.transactions || [])
        setTransactionPagination(data.pagination || null)
      }
    } catch (error) {
      console.error('获取交易记录失败:', error)
    }
  }

  async function fetchProjectDetails(projectId: string) {
    setDetailsLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/costs`)
      if (res.ok) {
        const data = await res.json()
        setProjectDetails({
          total: data.total || 0,
          byType: data.byType || [],
          byAction: data.byAction || [],
          recentRecords: data.recentRecords || []
        })
      }
    } catch (error) {
      console.error('获取项目费用失败:', error)
    } finally {
      setDetailsLoading(false)
    }
  }

  if (status === 'loading' || !session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20 flex items-center justify-center">
        <div className="text-gray-500">{tc('loading')}</div>
      </div>
    )
  }

  const selectedProjectName = projects.find(p => p.projectId === selectedProject)?.projectName
  const filteredRecords = projectDetails?.recentRecords?.filter(r =>
    recordsFilter === 'all' ? true : r.apiType === recordsFilter
  ) || []
  const availableTypes = [...new Set(projectDetails?.recentRecords?.map(r => r.apiType) || [])]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
      <Navbar />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex gap-6 h-[calc(100vh-140px)]">

          {/* 左侧侧边栏 */}
          <div className="w-64 flex-shrink-0">
            <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-3xl shadow-lg shadow-slate-200/40 h-full flex flex-col p-5">

              {/* 用户信息 */}
              <div className="mb-6">
                <div className="mb-4">
                  <h2 className="font-semibold text-gray-900">{session.user?.name || t('user')}</h2>
                  <p className="text-xs text-gray-400">{t('personalAccount')}</p>
                </div>

                {/* 余额卡片 */}
                <div className="bg-gradient-to-br from-emerald-50 to-green-50/80 rounded-2xl p-4 border border-emerald-100/80">
                  <div className="text-xs text-emerald-600 font-medium">{t('availableBalance')}</div>
                  <div className="text-2xl font-bold text-emerald-700 mt-1">¥{balance?.balance?.toFixed(2) || '0.00'}</div>
                  <div className="flex gap-4 mt-3 text-xs">
                    <div>
                      <span className="text-amber-600">{t('frozen')}</span>
                      <span className="text-amber-700 font-medium ml-1">¥{balance?.frozenAmount?.toFixed(2) || '0.00'}</span>
                    </div>
                    <div>
                      <span className="text-purple-600">{t('totalSpent')}</span>
                      <span className="text-purple-700 font-medium ml-1">¥{balance?.totalSpent?.toFixed(2) || '0.00'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 导航菜单 */}
              <nav className="flex-1 space-y-2">
                <button
                  onClick={() => setActiveSection('apiConfig')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all cursor-pointer ${activeSection === 'apiConfig'
                    ? 'bg-blue-50 text-blue-700 border border-blue-100'
                    : 'text-gray-600 hover:bg-gray-50'
                    }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="font-medium">{t('apiConfig')}</span>
                </button>

                <button
                  onClick={() => setActiveSection('billing')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all cursor-pointer ${activeSection === 'billing'
                    ? 'bg-blue-50 text-blue-700 border border-blue-100'
                    : 'text-gray-600 hover:bg-gray-50'
                    }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                  </svg>
                  <span className="font-medium">{t('billingRecords')}</span>
                </button>
              </nav>

              {/* 退出登录 */}
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="mt-auto flex items-center gap-2 px-4 py-3 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                {t('logout')}
              </button>
            </div>
          </div>

          {/* 右侧内容区 */}
          <div className="flex-1 min-w-0">
            <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-3xl shadow-lg shadow-slate-200/40 h-full flex flex-col">

              {activeSection === 'apiConfig' ? (
                <ApiConfigTab />
              ) : (
                <>
                  {/* 扣费记录标题栏 */}
                  <div className="px-6 py-4 border-b border-gray-100/80 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {/* 返回按钮 */}
                      {selectedProject !== 'all' && (
                        <button onClick={() => setSelectedProject('all')} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 cursor-pointer">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                          {tc('back')}
                        </button>
                      )}

                      {/* 视图切换 */}
                      <div className="flex gap-1 bg-gray-100/80 rounded-xl p-1">
                        <button onClick={() => { setBillingView('transactions'); setSelectedProject('all') }} className={`px-4 py-2 text-sm rounded-lg transition-all cursor-pointer ${billingView === 'transactions' && selectedProject === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                          {t('accountTransactions')}
                        </button>
                        <button onClick={() => { setBillingView('projects'); setSelectedProject('all') }} className={`px-4 py-2 text-sm rounded-lg transition-all cursor-pointer ${billingView === 'projects' || selectedProject !== 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                          {t('projectDetails')}
                        </button>
                      </div>
                    </div>

                    {/* 项目内视图切换 */}
                    {selectedProject !== 'all' && (
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1 bg-gray-100/80 rounded-lg p-1">
                          <button onClick={() => setProjectViewMode('summary')} className={`px-3 py-1 text-xs rounded-md transition-all cursor-pointer ${projectViewMode === 'summary' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                            {t('summary')}
                          </button>
                          <button onClick={() => setProjectViewMode('records')} className={`px-3 py-1 text-xs rounded-md transition-all cursor-pointer ${projectViewMode === 'records' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                            {t('transactions')}
                          </button>
                        </div>
                        {projectViewMode === 'records' && (
                          <select
                            value={recordsFilter}
                            onChange={(e) => setRecordsFilter(e.target.value)}
                            className="px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white text-gray-700 cursor-pointer focus:outline-none"
                          >
                            <option value="all">{t('allTypes')}</option>
                            {availableTypes.map(type => (
                              <option key={type} value={type}>{t(`apiTypes.${type}`) || type}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 内容区域 */}
                  <div className="flex-1 overflow-y-auto p-5">
                    {loading ? (
                      <div className="space-y-3">{[1, 2, 3, 4, 5].map(i => <div key={i} className="h-16 bg-gray-50 rounded-xl animate-pulse"></div>)}</div>
                    ) : billingView === 'transactions' && selectedProject === 'all' ? (
                      /* 账户流水 */
                      <div className="h-full flex flex-col">
                        {/* 筛选按钮 */}
                        <div className="mb-3 flex items-center justify-between">
                          <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`px-4 py-2 text-sm rounded-xl border transition-all cursor-pointer flex items-center gap-2 ${showFilters
                              ? 'bg-blue-50 border-blue-200 text-blue-700'
                              : (txType !== 'all' || txStartDate || txEndDate)
                                ? 'bg-orange-50 border-orange-200 text-orange-700'
                                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                              }`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                            </svg>
                            {t('filter')}
                            {(txType !== 'all' || txStartDate || txEndDate) && !showFilters && (
                              <span className="ml-1 px-2 py-0.5 bg-orange-500 text-white text-xs rounded-full">
                                {[txType !== 'all', txStartDate, txEndDate].filter(Boolean).length}
                              </span>
                            )}
                          </button>
                        </div>

                        {/* 筛选栏 */}
                        {showFilters && (
                          <div className="mb-4 p-4 bg-gradient-to-br from-gray-50 to-blue-50/30 rounded-2xl border border-gray-100/80 space-y-3">
                            <div className="flex items-end gap-3">
                              <div className="flex-1">
                                <label className="text-xs font-medium text-gray-600 mb-1.5 block">{tb('transactionType')}</label>
                                <select
                                  value={txType}
                                  onChange={(e) => { setTxType(e.target.value as any); setTxPage(1) }}
                                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                                >
                                  <option value="all">{tb('all')}</option>
                                  <option value="recharge">{tb('income')}</option>
                                  <option value="consume">{tb('expense')}</option>
                                </select>
                              </div>
                              <div className="flex-1">
                                <label className="text-xs font-medium text-gray-600 mb-1.5 block">{tb('startDate')}</label>
                                <input
                                  type="date"
                                  value={txStartDate}
                                  onChange={(e) => { setTxStartDate(e.target.value); setTxPage(1) }}
                                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                                />
                              </div>
                              <div className="flex-1">
                                <label className="text-xs font-medium text-gray-600 mb-1.5 block">{tb('endDate')}</label>
                                <input
                                  type="date"
                                  value={txEndDate}
                                  onChange={(e) => { setTxEndDate(e.target.value); setTxPage(1) }}
                                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                                />
                              </div>
                              {(txType !== 'all' || txStartDate || txEndDate) && (
                                <button
                                  onClick={() => { setTxType('all'); setTxStartDate(''); setTxEndDate(''); setTxPage(1) }}
                                  className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all cursor-pointer shadow-sm">
                                  {tb('reset')}
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {/* 流水列表 */}
                        <div className="flex-1 overflow-y-auto">
                          {transactions.length > 0 ? (
                            <div className="space-y-2">
                              {transactions.map(tx => (
                                <div key={tx.id} className="flex items-center justify-between p-4 bg-white/60 hover:bg-white/80 rounded-2xl transition-all border border-white/60">
                                  <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tx.type === 'recharge' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-500'}`}>
                                      {tx.type === 'recharge' ? (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                      ) : (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                                      )}
                                    </div>
                                    <div>
                                      <div className="font-medium text-gray-900 text-sm">{tx.description || (tx.type === 'recharge' ? t('recharge') : t('consume'))}</div>
                                      <div className="text-xs text-gray-400 mt-0.5">{formatDate(tx.createdAt)}</div>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className={`font-semibold ${tx.type === 'recharge' ? 'text-emerald-600' : 'text-red-500'}`}>
                                      {tx.type === 'recharge' ? '+' : ''}¥{Math.abs(tx.amount).toFixed(2)}
                                    </div>
                                    <div className="text-xs text-gray-400 mt-0.5">{t('balanceAfter', { amount: tx.balanceAfter.toFixed(2) })}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400">
                              <svg className="w-16 h-16 mb-4 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                              <p className="text-sm">{t('noTransactions')}</p>
                            </div>
                          )}
                        </div>

                        {/* 分页 */}
                        {transactionPagination && transactionPagination.totalPages > 1 && (
                          <div className="mt-4 pt-4 border-t border-gray-100/80 flex items-center justify-between">
                            <div className="text-sm text-gray-500">
                              {t('pagination', { total: transactionPagination.total, page: transactionPagination.page, totalPages: transactionPagination.totalPages })}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setTxPage(Math.max(1, txPage - 1))}
                                disabled={txPage === 1}
                                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                              >{t('previousPage')}</button>
                              <button
                                onClick={() => setTxPage(Math.min(transactionPagination.totalPages, txPage + 1))}
                                disabled={txPage === transactionPagination.totalPages}
                                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                              >{t('nextPage')}</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : selectedProject === 'all' ? (
                      /* 项目列表 */
                      projects.length > 0 ? (
                        <div className="space-y-2">
                          {projects.map(p => (
                            <div key={p.projectId} onClick={() => setSelectedProject(p.projectId)} className="flex items-center justify-between p-4 bg-white/60 hover:bg-white/80 rounded-2xl transition-all cursor-pointer border border-white/60">
                              <div>
                                <div className="font-medium text-gray-900">{p.projectName}</div>
                                <div className="text-xs text-gray-400 mt-0.5">{t('recordCount', { count: p.recordCount })}</div>
                              </div>
                              <div className="font-semibold text-gray-900">¥{p.totalCost.toFixed(2)}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400"><p className="text-sm">{t('noProjectCosts')}</p></div>
                      )
                    ) : detailsLoading ? (
                      <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-50 rounded-xl animate-pulse"></div>)}</div>
                    ) : projectDetails ? (
                      projectViewMode === 'summary' ? (
                        /* 汇总视图 */
                        <div className="space-y-6">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium text-gray-900">{selectedProjectName}</h4>
                            <div className="text-lg font-bold text-gray-900">{t('totalCost', { amount: projectDetails.total.toFixed(2) })}</div>
                          </div>

                          <div>
                            <h5 className="text-sm font-medium text-gray-500 mb-3">{t('byType')}</h5>
                            <div className="grid grid-cols-3 gap-3">
                              {projectDetails.byType.map(item => {
                                const colors = TYPE_COLORS[item.apiType] || { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-100' }
                                return (
                                  <div
                                    key={item.apiType}
                                    onClick={() => { setProjectViewMode('records'); setRecordsFilter(item.apiType) }}
                                    className={`${colors.bg} ${colors.border} border rounded-2xl p-4 cursor-pointer hover:shadow-sm transition-shadow`}
                                  >
                                    <div className={`text-xs ${colors.text} font-medium`}>{t(`apiTypes.${item.apiType}` as any) || item.apiType}</div>
                                    <div className={`text-xl font-bold ${colors.text} mt-1`}>¥{(item._sum.cost || 0).toFixed(2)}</div>
                                    <div className="text-xs text-gray-400 mt-1">{item._count} {t('times')}</div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>

                          <div>
                            <h5 className="text-sm font-medium text-gray-500 mb-3">{t('byAction')}</h5>
                            <div className="space-y-2">
                              {projectDetails.byAction.map(item => (
                                <div key={item.action} className="flex items-center justify-between p-3 bg-white/60 rounded-xl border border-white/60">
                                  <div className="flex items-center gap-3">
                                    <div className="text-sm text-gray-900">{t(`actionTypes.${item.action.replace(/-/g, '_')}` as any) || item.action}</div>
                                    <span className="text-xs text-gray-400">{item._count} {t('times')}</span>
                                  </div>
                                  <div className="font-medium text-gray-700">¥{(item._sum.cost || 0).toFixed(2)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* 流水视图 */
                        <div className="space-y-2">
                          {filteredRecords.length > 0 ? filteredRecords.map(record => {
                            const colors = TYPE_COLORS[record.apiType] || { bg: 'bg-gray-100', text: 'text-gray-700', border: '' }
                            return (
                              <div key={record.id} className="flex items-center justify-between p-3 bg-white/60 rounded-xl border border-white/60">
                                <div className="flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-lg ${colors.bg} ${colors.text} flex items-center justify-center text-xs font-medium`}>
                                    {(t(`apiTypes.${record.apiType}` as any) || record.apiType).charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="text-sm text-gray-900">{t(`actionTypes.${record.action.replace(/-/g, '_')}` as any) || record.action}</div>
                                    <div className="text-xs text-gray-400">{record.model} · {formatDate(record.createdAt)}</div>
                                  </div>
                                </div>
                                <div className="font-medium text-gray-700">¥{record.cost.toFixed(4)}</div>
                              </div>
                            )
                          }) : (
                            <div className="text-center py-8 text-gray-400 text-sm">{t('noRecords')}</div>
                          )}
                        </div>
                      )
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-gray-400"><p className="text-sm">{t('noDetails')}</p></div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main >
    </div >
  )
}
