'use client'
import { useState } from 'react'
import { AdminUsers } from '@/components/admin/AdminUsers'
import { AdminPlans } from '@/components/admin/AdminPlans'
import { AdminRoles } from '@/components/admin/AdminRoles'
import { AdminApiKeys } from '@/components/admin/AdminApiKeys'

const TABS = [
  { id: 'users', label: 'Users' },
  { id: 'plans', label: 'Plans & Pricing' },
  { id: 'roles', label: 'Roles' },
  { id: 'api-keys', label: 'API keys' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabId>('users')

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Admin panel</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage users, roles, plans, and pricing.</p>
      </div>

      <div className="mb-6 flex gap-1 border-b">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm transition ${
              activeTab === tab.id
                ? 'border-pr-teal font-medium text-pr-teal'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'users' && <AdminUsers />}
      {activeTab === 'plans' && <AdminPlans />}
      {activeTab === 'roles' && <AdminRoles />}
      {activeTab === 'api-keys' && <AdminApiKeys />}
    </div>
  )
}
