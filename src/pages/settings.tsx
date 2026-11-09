import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { NativeSelect } from '@/components/ui/native-select'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Save, Download, Database, Shield, LogOut, BarChart3, ChevronRight, Sparkles, Copy, Check } from 'lucide-react'

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [backupMessage, setBackupMessage] = useState('')

  useEffect(() => {
    api<Record<string, string>>('/settings').then(setSettings).catch(() => {})
  }, [])

  const update = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    await api('/settings', { method: 'PUT', body: JSON.stringify(settings) })
    setSaving(false)
  }

  const handleBackup = async () => {
    const result = await api<{ message: string; path: string }>('/settings/backup', { method: 'POST' })
    setBackupMessage(`Backup saved: ${result.path}`)
    setTimeout(() => setBackupMessage(''), 5000)
  }

  const handleExport = async () => {
    const data = await api<unknown>('/settings/export')
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hypertrophy-export-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      {/* Phones reach this page from the "More" tab, so link the pages without their own tab */}
      <div className="space-y-3 md:hidden">
        <h1 className="text-2xl font-bold tracking-tight">More</h1>
        <Card>
          <Link to="/analytics" className="flex h-14 items-center gap-3 px-4 active:bg-muted/30">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1 font-medium">Analytics</span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Link>
        </Card>
      </div>

      <h1 className="hidden text-2xl font-bold tracking-tight md:block">Settings</h1>
      <h2 className="pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground md:hidden">Settings</h2>

      {/* Context for the Claude connector (read by get_training_overview) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Coaching notes
          </CardTitle>
          <p className="text-xs text-muted-foreground">Claude reads these when it reviews your training. Save with Save Settings below.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Goals</label>
            <textarea
              value={settings.advisorGoals || ''}
              onChange={(e) => update('advisorGoals', e.target.value)}
              rows={3}
              placeholder="e.g. Bring up side delts and upper chest, keep legs at maintenance, 5 days a week"
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-base md:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Current condition</label>
            <textarea
              value={settings.advisorCondition || ''}
              onChange={(e) => update('advisorCondition', e.target.value)}
              rows={3}
              placeholder="e.g. Sleeping ~6h, left elbow sore on curls, gym has no hack squat"
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-base md:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <ConnectorUrl />
        </CardContent>
      </Card>

      {/* Units & Increments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Units & load increments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Weight Unit</label>
              <NativeSelect
                value={settings.units || 'lb'}
                onChange={(e) => update('units', e.target.value)}
                className="mt-1"
              >
                <option value="lb">Pounds (lb)</option>
                <option value="kg">Kilograms (kg)</option>
              </NativeSelect>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Theme</label>
              <NativeSelect
                value={settings.theme || 'dark'}
                onChange={(e) => update('theme', e.target.value)}
                className="mt-1"
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </NativeSelect>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Barbell</label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.5"
                value={settings.incrementBarbell || '5'}
                onChange={(e) => update('incrementBarbell', e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Dumbbell</label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.5"
                value={settings.incrementDumbbell || '2.5'}
                onChange={(e) => update('incrementDumbbell', e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Cable</label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.5"
                value={settings.incrementCable || '5'}
                onChange={(e) => update('incrementCable', e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rest Timer Defaults */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Rest Timer Defaults (seconds)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Compound Exercises</label>
              <Input
                type="number"
                inputMode="numeric"
                step="15"
                value={settings.restTimerCompound || '120'}
                onChange={(e) => update('restTimerCompound', e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Isolation Exercises</label>
              <Input
                type="number"
                inputMode="numeric"
                step="15"
                value={settings.restTimerIsolation || '90'}
                onChange={(e) => update('restTimerIsolation', e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Body Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Body Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <BodyWeightLogger />
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="h-11 w-full">
        <Save className="mr-2 h-4 w-4" />
        {saving ? 'Saving...' : 'Save Settings'}
      </Button>

      {/* Data Management */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4" /> Data Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={handleBackup}>
              <Shield className="mr-2 h-4 w-4" /> Backup Database
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" /> Export JSON
            </Button>
          </div>
          {backupMessage && (
            <Badge variant="safe" className="text-xs whitespace-normal break-all">{backupMessage}</Badge>
          )}
        </CardContent>
      </Card>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4" /> Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {user && (
            <p className="text-xs text-muted-foreground">{user.email}</p>
          )}
          <Button variant="outline" className="w-full" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function BodyWeightLogger() {
  const [weight, setWeight] = useState('')
  const [saving, setSaving] = useState(false)

  const handleLog = async () => {
    if (!weight) return
    setSaving(true)
    await api('/settings/body-metrics', {
      method: 'POST',
      body: JSON.stringify({ bodyweight: parseFloat(weight) }),
    })
    setWeight('')
    setSaving(false)
  }

  return (
    <div className="flex gap-2">
      <Input
        type="number"
        inputMode="decimal"
        step="0.1"
        placeholder="Body weight"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
      />
      <Button variant="outline" onClick={handleLog} disabled={saving || !weight}>
        Log
      </Button>
    </div>
  )
}

function ConnectorUrl() {
  const url = `${window.location.origin}/api/mcp`
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard blocked; the URL is selectable */ }
  }
  return (
    <div className="space-y-1.5 rounded-lg bg-muted/50 p-3">
      <p className="text-xs font-medium">Connect Claude</p>
      <p className="text-xs text-muted-foreground">
        In Claude, go to Customize → Connectors → Add custom connector and paste this URL. You'll be asked to allow access.
      </p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1.5 text-xs select-all">{url}</code>
        <Button variant="outline" size="icon" className="shrink-0" onClick={copy} aria-label="Copy connector URL">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}
