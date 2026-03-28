import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import { Save, Download, Database, Shield } from 'lucide-react'

export default function SettingsPage() {
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
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Settings</h1>

      {/* Units & Increments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Units & Load Increments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Weight Unit</label>
              <select
                value={settings.units || 'lb'}
                onChange={(e) => update('units', e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="lb">Pounds (lb)</option>
                <option value="kg">Kilograms (kg)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Theme</label>
              <select
                value={settings.theme || 'dark'}
                onChange={(e) => update('theme', e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Barbell Increment</label>
              <Input
                type="number"
                step="0.5"
                value={settings.incrementBarbell || '5'}
                onChange={(e) => update('incrementBarbell', e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Dumbbell Increment</label>
              <Input
                type="number"
                step="0.5"
                value={settings.incrementDumbbell || '2.5'}
                onChange={(e) => update('incrementDumbbell', e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Cable Increment</label>
              <Input
                type="number"
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Compound Exercises</label>
              <Input
                type="number"
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

      <Button onClick={handleSave} disabled={saving} className="w-full">
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
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={handleBackup}>
              <Shield className="mr-2 h-4 w-4" /> Backup Database
            </Button>
            <Button variant="outline" className="flex-1" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" /> Export JSON
            </Button>
          </div>
          {backupMessage && (
            <Badge variant="safe" className="text-xs">{backupMessage}</Badge>
          )}
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
